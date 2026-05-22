import { useAtom } from "jotai";
import { isAxiosError } from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import { isEditorSessionEnabled } from "@/lib/config";
import { socketAtom } from "@/features/websocket/atoms/socket-atom";
import {
  acquireEditorSession,
  heartbeatEditorSession,
  releaseEditorSession,
  releaseEditorSessionOnUnload,
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

function isSameEditSession(
  left?: EditSession | null,
  right?: EditSession | null,
) {
  return Boolean(
    left &&
      right &&
      left.sessionId === right.sessionId &&
      left.clientId === right.clientId &&
      left.leaseId === right.leaseId &&
      left.token === right.token,
  );
}

function isEditorSessionConflict(error: unknown) {
  return (
    isAxiosError(error) &&
    error.response?.status === 409 &&
    error.response?.data?.code === "EDITOR_SESSION_CONFLICT"
  );
}

export function useEditorSessionLease(opts: {
  enabled: boolean;
  resourceType: EditorSessionResourceType;
  resourceId?: string | null;
}) {
  const [socket] = useAtom(socketAtom);
  const featureEnabled = isEditorSessionEnabled();
  const [state, setState] = useState<LeaseState>(DISABLED_STATE);
  const editSessionRef = useRef<EditSession | undefined>(undefined);
  const heartbeatRecoveryRef = useRef(false);
  const localReleaseRef = useRef<EditSession | undefined>(undefined);
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

      if (reason !== "unload") {
        localReleaseRef.current = editSession;
      }

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
  }, [
    applyResponse,
    enabled,
    opts.resourceId,
    opts.resourceType,
    registerClient,
  ]);

  const reacquire = useCallback(async () => {
    if (!enabled || !opts.resourceId || heartbeatRecoveryRef.current) return;

    heartbeatRecoveryRef.current = true;
    try {
      const clientId = await ensureUniqueEditorSessionClientId();
      registerClient(clientId);

      const response = await acquireEditorSession({
        resourceType: opts.resourceType,
        resourceId: opts.resourceId,
        clientId,
      });
      applyResponse(response);
    } catch {
      editSessionRef.current = undefined;
      setState({ status: "revoked", writable: false });
    } finally {
      heartbeatRecoveryRef.current = false;
    }
  }, [
    applyResponse,
    enabled,
    opts.resourceId,
    opts.resourceType,
    registerClient,
  ]);

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
  }, [
    applyResponse,
    enabled,
    opts.resourceId,
    opts.resourceType,
    registerClient,
  ]);

  useEffect(() => {
    if (!enabled || !opts.resourceId) return;

    const releaseOnUnload = () => {
      const editSession = editSessionRef.current;
      if (!editSession) return;

      releaseEditorSessionOnUnload({
        resourceType: opts.resourceType,
        resourceId: opts.resourceId!,
        editSession,
        reason: "unload",
      });
    };
    const releaseOnPageHide = (event: PageTransitionEvent) => {
      if (event.persisted) return;
      releaseOnUnload();
    };

    window.addEventListener("pagehide", releaseOnPageHide);
    window.addEventListener("beforeunload", releaseOnUnload);

    const interval = window.setInterval(() => {
      const editSession = editSessionRef.current;
      if (!editSession) return;

      heartbeatEditorSession({
        resourceType: opts.resourceType,
        resourceId: opts.resourceId!,
        editSession,
      })
        .then(applyResponse)
        .catch((error) => {
          if (isEditorSessionConflict(error)) {
            void reacquire();
            return;
          }
        });
    }, 5000);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("pagehide", releaseOnPageHide);
      window.removeEventListener("beforeunload", releaseOnUnload);
    };
  }, [applyResponse, enabled, opts.resourceId, opts.resourceType, reacquire]);

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

      const currentEditSession = editSessionRef.current;
      if (
        currentEditSession &&
        event.editSession &&
        !isSameEditSession(event.editSession, currentEditSession)
      ) {
        return;
      }

      editSessionRef.current = event.editSession ?? currentEditSession;
      if (event.status === "revoked") {
        const isLocalRelease = isSameEditSession(
          event.editSession,
          localReleaseRef.current,
        );
        if (isLocalRelease) {
          localReleaseRef.current = undefined;
        } else {
          void reacquire();
          return;
        }
      }

      setState({
        status: event.status,
        writable: event.writable,
        editSession: event.editSession ?? currentEditSession,
        takeoverId: event.takeoverId,
        graceUntil: event.graceUntil,
      });
    };

    socket.on("message", handler);
    return () => {
      socket.off("message", handler);
    };
  }, [enabled, opts.resourceId, opts.resourceType, reacquire, socket]);

  return {
    ...state,
    enabled,
    release,
    takeover,
  };
}
