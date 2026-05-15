export type EditorSessionResourceType = 'page' | 'file';

export type EditorSessionLeaseStatus =
  | 'active'
  | 'blocked_by_other'
  | 'pending_takeover'
  | 'takeover_requested'
  | 'revoked';

export type EditorSessionWriteIntent = 'normal' | 'handoff_flush';

export type EditorSessionRef = {
  sessionId: string;
  clientId: string;
  leaseId: string;
  token: number;
  takeoverId?: string;
};

export type EditorSessionLeaseRecord = EditorSessionRef & {
  socketId?: string | null;
  startedAt: number;
  lastHeartbeatAt: number;
};

export type EditorSessionState = {
  version: 1;
  workspaceId: string;
  userId: string;
  resourceType: EditorSessionResourceType;
  resourceId: string;
  status: 'active' | 'takeover_pending';
  active: EditorSessionLeaseRecord;
  pending?: EditorSessionLeaseRecord | null;
  takeoverId?: string | null;
  graceUntil?: number | null;
  handoffFlushUsed?: boolean;
  updatedAt: number;
};

export type EditorSessionSocketRegistration = {
  workspaceId: string;
  userId: string;
  sessionId?: string | null;
  clientId: string;
  socketId: string;
  updatedAt: number;
};

export type EditorSessionEventPayload = {
  workspaceId: string;
  userId: string;
  socketId?: string | null;
  resourceType: EditorSessionResourceType;
  resourceId: string;
  clientId: string;
  takeoverId?: string | null;
  lease?: EditorSessionRef | null;
  status: EditorSessionLeaseStatus;
  writable: boolean;
  graceUntil?: number | null;
};

export type EditorSessionLeaseResponse = {
  resourceType: EditorSessionResourceType;
  resourceId: string;
  status: EditorSessionLeaseStatus;
  writable: boolean;
  editSession?: EditorSessionRef;
  takeoverId?: string | null;
  graceUntil?: number | null;
  activeClientId?: string | null;
  pendingClientId?: string | null;
};
