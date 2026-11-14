import { Logger } from '@nestjs/common';
import { identityStage, withIdentityTiming } from './identity.timing';

describe('identity timing', () => {
  afterEach(() => jest.restoreAllMocks());

  it('measures a request without changing its result or logging private errors', async () => {
    const logs = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const reply = {header: jest.fn()};
    const result = await withIdentityTiming('callback', reply, () => identityStage('token_exchange', async () => ({access_token: 'private-token'})));
    expect(result.access_token).toBe('private-token');
    expect(reply.header).toHaveBeenCalledWith('Server-Timing', expect.stringContaining('token_exchange;dur='));
    expect(reply.header).toHaveBeenCalledWith('X-Identity-Request-Id', expect.any(String));
    expect(JSON.stringify(logs.mock.calls)).not.toContain('private-token');

    const failure = new Error('https://center.test/callback?code=private-code');
    await expect(withIdentityTiming('callback', reply, () => identityStage('token_exchange', async () => {throw failure;}))).rejects.toBe(failure);
    expect(logs.mock.calls.at(-1)?.[0]).toMatchObject({outcome: 'error', stages: [{stage: 'token_exchange', outcome: 'error'}]});
    expect(JSON.stringify(logs.mock.calls)).not.toContain('private-code');
  });

  it('keeps overlapping callbacks isolated and nests verification in its parent', async () => {
    const logs = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    let release!: () => void;
    const gate = new Promise<void>(resolve => {release = resolve;});
    const first = withIdentityTiming('callback', undefined, () => identityStage('token_exchange', async () => {await gate;}));
    await withIdentityTiming('start', undefined, () => identityStage('hosted_create', async () => undefined));
    release();
    await first;
    const records = logs.mock.calls.map(call => call[0] as any);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({stage: 'start', stages: [{stage: 'hosted_create'}]});
    expect(records[1]).toMatchObject({stage: 'callback', stages: [{stage: 'token_exchange'}]});
    expect(records[0].requestId).not.toBe(records[1].requestId);
  });

  it('does not let a failed sink change authentication success or failure', async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {throw new Error('sink_down');});
    const reply = {header: () => {throw new Error('header_sink_down');}};
    await expect(withIdentityTiming('bootstrap', reply, async () => 42)).resolves.toBe(42);
    const failure = new Error('auth_failure');
    await expect(withIdentityTiming('bootstrap', reply, async () => {throw failure;})).rejects.toBe(failure);
  });
});
