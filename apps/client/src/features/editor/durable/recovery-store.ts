export type DraftScope = {
  workspaceId: string;
  userId: string;
  pageId: string;
};
export type DurableDraft = DraftScope & {
  id: string;
  text: string;
  binary: Uint8Array;
  epoch: string | null;
  updatedAt: number;
};
const databaseName = "docmost-durable-recovery-v1";
const chains = new Map<string, Promise<unknown>>();
export const draftKey = (scope: DraftScope) =>
  `${scope.workspaceId}:${scope.userId}:${scope.pageId}`;
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 2);
    request.onupgradeneeded = () => {
      const store = request.result.objectStoreNames.contains("drafts")
        ? request.transaction!.objectStore("drafts")
        : request.result.createObjectStore("drafts", { keyPath: "id" });
      if (!store.indexNames.contains("by-scope-time"))
        store.createIndex("by-scope-time", ["scopeKey", "updatedAt"]);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function access<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction("drafts", mode);
      const request = action(transaction.objectStore("drafts"));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}
function serialize<T>(scope: DraftScope, action: () => Promise<T>): Promise<T> {
  const key = draftKey(scope);
  const promise = (chains.get(key) ?? Promise.resolve())
    .catch(() => {})
    .then(action);
  chains.set(key, promise);
  void promise
    .finally(() => {
      if (chains.get(key) === promise) chains.delete(key);
    })
    .catch(() => {});
  return promise;
}
export function saveDurableDraft(
  scope: DraftScope,
  draft: Omit<DurableDraft, keyof DraftScope | "id" | "updatedAt">,
  draftId: string,
) {
  return serialize(scope, () =>
    access("readwrite", (store) =>
      store.put({
        ...scope,
        ...draft,
        id: draftKey(scope) + ":" + draftId,
        scopeKey: draftKey(scope),
        updatedAt: Date.now(),
      }),
    ),
  );
}
export function readDurableDraft(
  scope: DraftScope,
): Promise<DurableDraft | undefined> {
  return serialize(scope, async () => {
    const db = await database();
    try {
      return await new Promise<DurableDraft | undefined>((resolve, reject) => {
        const transaction = db.transaction("drafts", "readonly");
        const request = transaction
          .objectStore("drafts")
          .index("by-scope-time")
          .openCursor(
            IDBKeyRange.bound(
              [draftKey(scope), 0],
              [draftKey(scope), Number.MAX_SAFE_INTEGER],
            ),
            "prev",
          );
        request.onsuccess = () => resolve(request.result?.value);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  });
}
export function deleteDurableDraft(scope: DraftScope, draftId: string) {
  return serialize(scope, () =>
    access("readwrite", (store) =>
      store.delete(draftKey(scope) + ":" + draftId),
    ),
  );
}
