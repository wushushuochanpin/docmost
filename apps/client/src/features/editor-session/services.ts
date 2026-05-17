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

export function releaseEditorSessionOnUnload(data: {
  resourceType: EditorSessionResourceType;
  resourceId: string;
  editSession: EditSession;
  reason?: "unload" | "takeover_ack" | "manual";
}) {
  const payload = JSON.stringify(data);

  if (navigator.sendBeacon) {
    const body = new Blob([payload], { type: "application/json" });
    if (navigator.sendBeacon("/api/editor-sessions/release", body)) {
      return;
    }
  }

  void fetch("/api/editor-sessions/release", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: payload,
    keepalive: true,
  }).catch(() => undefined);
}
