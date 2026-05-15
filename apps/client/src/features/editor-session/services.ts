import api from "@/lib/api-client";
import type {
  EditSession,
  EditorSessionResourceType,
  EditorSessionResponse,
} from "./types";

export async function acquireEditorSession(data: {
  resourceType: EditorSessionResourceType;
  resourceId: string;
  clientId: string;
}): Promise<EditorSessionResponse> {
  const req = await api.post<EditorSessionResponse>(
    "/editor-sessions/acquire",
    data,
  );
  return req.data;
}

export async function takeoverEditorSession(data: {
  resourceType: EditorSessionResourceType;
  resourceId: string;
  clientId: string;
}): Promise<EditorSessionResponse> {
  const req = await api.post<EditorSessionResponse>(
    "/editor-sessions/takeover",
    data,
  );
  return req.data;
}

export async function heartbeatEditorSession(data: {
  resourceType: EditorSessionResourceType;
  resourceId: string;
  editSession: EditSession;
}): Promise<EditorSessionResponse> {
  const req = await api.post<EditorSessionResponse>(
    "/editor-sessions/heartbeat",
    data,
  );
  return req.data;
}

export async function releaseEditorSession(data: {
  resourceType: EditorSessionResourceType;
  resourceId: string;
  editSession: EditSession;
  reason?: "unload" | "takeover_ack" | "manual";
}): Promise<EditorSessionResponse> {
  const req = await api.post<EditorSessionResponse>(
    "/editor-sessions/release",
    data,
  );
  return req.data;
}
