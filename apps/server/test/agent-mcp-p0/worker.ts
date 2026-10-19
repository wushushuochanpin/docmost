// Fault-injection child: executes the SAME transaction probe as the parent tests.
import * as Y from 'yjs';
import { db, Store, principal } from './store';
process.once(
  'message',
  async (request: { id: string; lease: any; stop: 'before' | 'after' }) => {
    const sql = db();
    const store = new Store(sql);
    const doc = new Y.Doc();
    doc.getText('body').insert(0, 'worker-content');
    try {
      await store.commit(
        principal,
        request.id,
        request.lease,
        Y.encodeStateAsUpdate(doc),
        {
          beforeCommit:
            request.stop === 'before'
              ? async () => {
                  process.send?.({ phase: 'before' });
                  await new Promise<void>(() => {});
                }
              : undefined,
        },
      );
      process.send?.({ phase: 'after' });
    } catch (error) {
      process.send?.({ error: String(error) });
    } finally {
      doc.destroy();
    }
  },
);
// Keep IPC and the connection alive until the harness kills this process.
setInterval(() => {}, 1000);

process.on('disconnect', () => process.exit(1));
