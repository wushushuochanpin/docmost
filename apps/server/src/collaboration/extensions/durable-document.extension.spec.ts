import { ConflictException } from '@nestjs/common';
import { DurableDocumentExtension } from './durable-document.extension';

describe('durable document update rejection', () => {
  const permit = {
    workspaceId: 'workspace',
    userId: 'user',
    pageId: 'page',
    id: 'permit',
    sessionId: 'session',
    editEpoch: 'epoch',
    ownerEpoch: 'owner',
  };
  function fixture(ingest: jest.Mock) {
    const extension = new DurableDocumentExtension({ ingest } as any);
    const connection = {
      readOnly: false,
      sendStateless: jest.fn(),
      close: jest.fn(),
      context: { documentPermit: permit },
    };
    return { extension, connection };
  }
  const payload = (overrides: Record<string, unknown> = {}) =>
    JSON.stringify({
      type: 'document_update',
      updateId: 'update-1',
      editEpoch: 'epoch',
      update: Buffer.from('update').toString('base64'),
      ...overrides,
    });

  it('turns a stale permit into a typed rejection and a retryable close instead of an unhandled rejection', async () => {
    const ingest = jest
      .fn()
      .mockRejectedValue(new ConflictException('DOCUMENT_PERMIT_EXPIRED'));
    const { extension, connection } = fixture(ingest);
    await expect(
      extension.onStateless({
        payload: payload(),
        connection,
      } as any),
    ).resolves.toBeUndefined();
    expect(connection.sendStateless).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'document_update_rejected',
        updateId: 'update-1',
        error: 'DOCUMENT_PERMIT_EXPIRED',
      }),
    );
    expect(connection.close).toHaveBeenCalledWith({
      code: 4409,
      reason: 'DOCUMENT_PERMIT_EXPIRED',
    });
  });

  it('rejects a stale edit epoch before persisting and tells the client to recover', async () => {
    const ingest = jest.fn();
    const { extension, connection } = fixture(ingest);
    await expect(
      extension.onStateless({
        payload: payload({ editEpoch: 'old-epoch' }),
        connection,
      } as any),
    ).resolves.toBeUndefined();
    expect(ingest).not.toHaveBeenCalled();
    expect(connection.sendStateless).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'document_update_rejected',
        updateId: 'update-1',
        error: 'INVALID_DOCUMENT_ENVELOPE',
      }),
    );
  });

  it('acknowledges a successful durable write only after ingest commits', async () => {
    const ingest = jest.fn().mockResolvedValue('2');
    const { extension, connection } = fixture(ingest);
    await extension.onStateless({
      payload: payload(),
      connection,
    } as any);
    expect(connection.sendStateless).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'durable_ack',
        updateId: 'update-1',
        revision: '2',
        editEpoch: 'epoch',
      }),
    );
    expect(connection.close).not.toHaveBeenCalled();
  });
});
