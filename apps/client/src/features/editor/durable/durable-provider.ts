import { HocuspocusProvider } from "@hocuspocus/provider";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as Y from "yjs";
import {
  deleteDurableDraft,
  DraftScope,
  saveDurableDraft,
} from "./recovery-store";
export type DurableState = {
  permitted: boolean;
  pending: number;
  recovery: boolean;
  storageError: boolean;
};
function base64(value: Uint8Array) {
  let text = "";
  for (let i = 0; i < value.length; i += 8192)
    text += String.fromCharCode(...value.subarray(i, i + 8192));
  return btoa(text);
}
/** Hocuspocus 4 adapter: only the epoch-bearing stateless envelope may upload Yjs changes. */
export class DurableProvider extends HocuspocusProvider {
  private epoch: string | null = null;
  private permitted = false;
  private recovery = false;
  private storageError = false;
  private pending = new Map<string, Uint8Array>();
  private stopped = false;
  private restoreRequest?: {
    id: string;
    resolve: (value: { title: string; revision: string }) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  };
  get canRestore() {
    return (
      this.permitted &&
      !this.recovery &&
      !this.pending.size &&
      !this.restoreRequest
    );
  }
  restore(
    historyId: string,
    versionToken: string,
  ): Promise<{ title: string; revision: string }> {
    if (!this.canRestore) return Promise.reject(new Error("DOCUMENT_BUSY"));
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const timer = setTimeout(() => {
        this.restoreRequest = undefined;
        this.recovery = true;
        this.report();
        reject(new Error("RESTORE_RESULT_UNKNOWN"));
      }, 15000);
      this.restoreRequest = { id, resolve, reject, timer };
      this.report();
      this.sendStateless(
        JSON.stringify({
          type: "document_restore",
          historyId,
          versionToken,
          updateId: id,
          editEpoch: this.epoch,
        }),
      );
    });
  }
  private readonly draftId = crypto.randomUUID();
  scope?: DraftScope;
  onDurableState?: (state: DurableState) => void;
  override decrementUnsyncedChanges() {
    this.report();
  }
  private report() {
    this.unsyncedChanges = this.pending.size;
    this.emit("unsyncedChanges", { number: this.unsyncedChanges });
    this.onDurableState?.({
      permitted:
        this.permitted &&
        !this.recovery &&
        !this.storageError &&
        !this.restoreRequest,
      pending: this.pending.size,
      recovery: this.recovery,
      storageError: this.storageError,
    });
  }
  override send(Message: Parameters<HocuspocusProvider["send"]>[0], args: any) {
    const message = new Message();
    const encoded = message.get(args);
    if (encoded) {
      const decoder = decoding.createDecoder(encoding.toUint8Array(encoded));
      decoding.readVarString(decoder);
      if (
        decoding.readVarUint(decoder) === 0 &&
        decoding.readVarUint(decoder) !== 0
      )
        return;
    }
    super.send(Message, args);
  }
  override documentUpdateHandler(update: Uint8Array, origin: unknown) {
    if (origin === this || this.stopped) return;
    const id = crypto.randomUUID();
    this.pending.set(id, update.slice());
    if (!this.permitted || !this.epoch || this.restoreRequest)
      this.recovery = true;
    this.report();
    const snapshot = Y.encodeStateAsUpdate(this.document);
    const text = this.document
      .getXmlFragment("default")
      .toArray()
      .map((node) =>
        node instanceof Y.XmlElement
          ? node
              .toArray()
              .map((child) =>
                child instanceof Y.XmlText
                  ? child.toString()
                  : child.toString(),
              )
              .join("")
          : node.toString(),
      )
      .join("\n");
    if (!this.scope) {
      this.storageError = true;
      this.report();
      return;
    }
    void saveDurableDraft(
      this.scope,
      {
        binary: snapshot,
        text,
        epoch: this.epoch,
      },
      this.draftId,
    )
      .then(() => {
        if (
          !this.stopped &&
          this.permitted &&
          !this.recovery &&
          this.pending.has(id)
        )
          this.upload(id, update);
      })
      .catch(() => {
        this.storageError = true;
        this.report();
      });
  }
  private upload(id: string, update: Uint8Array) {
    this.sendStateless(
      JSON.stringify({
        type: "document_update",
        updateId: id,
        editEpoch: this.epoch,
        update: base64(update),
      }),
    );
  }
  override receiveStateless(payload: string) {
    let message: any;
    try {
      message = JSON.parse(payload);
    } catch {
      return super.receiveStateless(payload);
    }
    if (
      message.type === "document_permit" &&
      typeof message.editEpoch === "string"
    ) {
      if (this.pending.size && this.epoch !== message.editEpoch)
        this.recovery = true;
      this.epoch = message.editEpoch;
      this.permitted = true;
      if (!this.recovery)
        for (const [id, update] of this.pending) this.upload(id, update);
      this.report();
    }
    if (
      message.type === "document_restore_result" &&
      this.restoreRequest?.id === message.updateId
    ) {
      const request = this.restoreRequest;
      this.restoreRequest = undefined;
      clearTimeout(request.timer);
      this.report();
      if (message.error) request.reject(new Error(message.error));
      else
        request.resolve({ title: message.title, revision: message.revision });
    }
    if (
      message.type === "durable_ack" &&
      message.editEpoch === this.epoch &&
      this.pending.delete(message.updateId)
    ) {
      if (!this.pending.size && this.scope)
        void deleteDurableDraft(this.scope, this.draftId).catch(() => {
          this.storageError = true;
          this.report();
        });
      this.report();
    }
    super.receiveStateless(payload);
  }
  override onClose() {
    if (this.restoreRequest) {
      clearTimeout(this.restoreRequest.timer);
      this.restoreRequest.reject(new Error("RESTORE_RESULT_UNKNOWN"));
      this.restoreRequest = undefined;
      this.recovery = true;
    }
    this.permitted = false;
    this.report();
    super.onClose();
  }
  override destroy() {
    if (this.restoreRequest) {
      clearTimeout(this.restoreRequest.timer);
      this.restoreRequest.reject(new Error("RESTORE_RESULT_UNKNOWN"));
      this.restoreRequest = undefined;
    }
    this.stopped = true;
    super.destroy();
  }
}
