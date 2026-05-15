import type { EditorSessionResourceType } from "./types";

const DB_NAME = "docmost-editor-session";
const STORE_NAME = "recovery-drafts";

type RecoveryDraft = {
  id: string;
  resourceType: EditorSessionResourceType;
  resourceId: string;
  content: unknown;
  reason: string;
  createdAt: number;
};

function openDraftDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function saveEditorRecoveryDraft(draft: {
  resourceType: EditorSessionResourceType;
  resourceId: string;
  content: unknown;
  reason: string;
}) {
  const db = await openDraftDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const record: RecoveryDraft = {
      ...draft,
      id: `${draft.resourceType}:${draft.resourceId}:${Date.now()}`,
      createdAt: Date.now(),
    };
    store.put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
