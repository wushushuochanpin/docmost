export type EditorSessionResourceType = "page" | "file";

export type EditorSessionStatus =
  | "disabled"
  | "active"
  | "blocked_by_other"
  | "pending_takeover"
  | "takeover_requested"
  | "revoked";

export type EditorSessionWriteIntent = "normal" | "handoff_flush";

export type EditSession = {
  sessionId: string;
  clientId: string;
  leaseId: string;
  token: number;
  takeoverId?: string;
};

export type EditorSessionResponse = {
  resourceType: EditorSessionResourceType;
  resourceId: string;
  status: Exclude<EditorSessionStatus, "disabled">;
  writable: boolean;
  editSession?: EditSession;
  takeoverId?: string | null;
  graceUntil?: number | null;
  activeClientId?: string | null;
  pendingClientId?: string | null;
};

export type EditorSessionSocketEvent = {
  operation:
    | "editorSession.takeoverRequested"
    | "editorSession.granted"
    | "editorSession.revoked";
  resourceType: EditorSessionResourceType;
  resourceId: string;
  clientId: string;
  status: Exclude<EditorSessionStatus, "disabled">;
  writable: boolean;
  editSession?: EditSession | null;
  takeoverId?: string | null;
  graceUntil?: number | null;
  workspaceId?: string;
};
