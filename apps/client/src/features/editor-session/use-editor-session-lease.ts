import { useAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { isEditorSessionEnabled } from "@/lib/config";
import { socketAtom } from "@/features/websocket/atoms/socket-atom";
import {
  acquireEditorSession,
  heartbeatEditorSession,
  releaseEditorSession,
  takeoverEditorSession,
} from "./services";
import {
  ensureUniqueEditorSessionClientId,
  getEditorSessionClientId,
} from "./client-id";
import type {
  EditSession,
  EditorSessionResourceType,
  EditorSessionResponse,
  EditorSessionSocketEvent,
  EditorSessionStatus,
} from "./types";

type LeaseState = {
  status: EditorSessionStatus;
  writable: boolean;
  editSession?: EditSession;
  takeoverId?: string | null;
  graceUntil?: number | null;
  activeClientId?: string | null;
  pendingClientId?: string | null;
};

const DISABLED_STATE: LeaseState = {
  status: "disabled",
  writable: true,
};

export function useEditorSessionLease(opts: {
  enabled: boolean;
  resourceType: EditorSessionResourceType;
  resourceId?: string | null;
}) {
  const [socket] = useAtom(socketAtom);
  const featureEnabled = isEditorSessionEnabled();
  const [state, setState] = useState<LeaseState>(DISABLED_STATE);
  const editSessionRef = useRef<EditSession | undefined>(undefined);
  const enabled = featureEnabled && opts.enabled && Boolean(opts.resourceId);

  const applyResponse = useCallback((response: EditorSessionResponse) => {
    const nextState: LeaseState = {
      status: response.status,
      writable: response.writable,
      editSession: response.editSession,
      takeoverId: response.takeoverId,
      graceUntil: response.graceUntil,
      activeClientId: response.activeClientId,
      pendingClientId: response.pendingClientId,
    };
    editSessionRef.current = response.editSession;
    setState(nextState);
  }, []);

  const release = useCallback(
    async (reason: "unload" | "takeover_ack" | "manual" = "manual") => {
      const editSession = editSessionRef.current;
      if (!enabled || !opts.resourceId || !editSession) return;

      const response = await releaseEditorSession({
        resourceType: opts.resourceType,
        resourceId: opts.resourceId,
        editSession,
        reason,
      });
      applyResponse(response);
    },
    [applyResponse, enabled, opts.resourceId, opts.resourceType],
  );

  const registerClient = useCallback(
    (clientId: string) => {
      if (socket?.connected) {
        socket.emit("message", {
          operation: "editorSession.registerClient",
          clientId,
        });
      }
    },
    [socket],
  );

  const takeover = useCallback(async () => {
    if (!enabled || !opts.resourceId) return;

    const clientId = await ensureUniqueEditorSessionClientId();
    registerClient(clientId);

    const response = await takeoverEditorSession({
      resourceType: opts.resourceType,
      resourceId: opts.resourceId,
      clientId,
    });
    applyResponse(response);
  }, [applyResponse, enabled, opts.resourceId, opts.resourceType, registerClient]);

  useEffect(() => {
    if (!enabled || !opts.resourceId) {
      editSessionRef.current = undefined;
      setState(DISABLED_STATE);
      return;
    }

    let cancelled = false;

    ensureUniqueEditorSessionClientId()
      .then((clientId) => {
        registerClient(clientId);

        return acquireEditorSession({
          resourceType: opts.resourceType,
          resourceId: opts.resourceId!,
          clientId,
        });
      })
      .then((response) => {
        if (!cancelled) {
          applyResponse(response);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: "revoked", writable: false });
        }
      });

    return () => {
      cancelled = true;
      const editSession = editSessionRef.current;
      editSessionRef.current = undefined;
      if (editSession) {
        void releaseEditorSession({
          resourceType: opts.resourceType,
          resourceId: opts.resourceId!,
          editSession,
          reason: "unload",
        }).catch(() => undefined);
      }
    };
  }, [applyResponse, enabled, opts.resourceId, opts.resourceType, registerClient]);

  useEffect(() => {
    if (!enabled || !opts.resourceId) return;

    const interval = window.setInterval(() => {
      const editSession = editSessionRef.current;
      if (!editSession) return;

      heartbeatEditorSession({
        resourceType: opts.resourceType,
        resourceId: opts.resourceId!,
        editSession,
      })
        .then(applyResponse)
        .catch(() => {
          editSessionRef.current = undefined;
          setState({ status: "revoked", writable: false });
        });
    }, 5000);

    return () => window.clearInterval(interval);
  }, [applyResponse, enabled, opts.resourceId, opts.resourceType]);

  useEffect(() => {
    if (!enabled || !opts.resourceId || !socket) return;

    const handler = (event: EditorSessionSocketEvent) => {
      if (
        !event?.operation?.startsWith("editorSession.") ||
        event.resourceType !== opts.resourceType ||
        event.resourceId !== opts.resourceId ||
        event.clientId !== getEditorSessionClientId()
      ) {
        return;
      }

      editSessionRef.current = event.editSession ?? editSessionRef.current;
      setState({
        status: event.status,
        writable: event.writable,
        editSession: event.editSession ?? editSessionRef.current,
        takeoverId: event.takeoverId,
        graceUntil: event.graceUntil,
      });
    };

    socket.on("message", handler);
    return () => {
      socket.off("message", handler);
    };
  }, [enabled, opts.resourceId, opts.resourceType, socket]);

  return {
    ...state,
    enabled,
    release,
    takeover,
  };
}
