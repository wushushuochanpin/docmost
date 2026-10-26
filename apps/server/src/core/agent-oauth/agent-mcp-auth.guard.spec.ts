import { UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { AgentMcpAuthGuard } from './agent-mcp-auth.guard';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';

describe('MCP identity-center authentication boundary', () => {
  const browserToken = `dms_${'b'.repeat(43)}`;
  const localSecret = 'local-application-secret-for-test-only';
  function harness(options: { bearer?: string; cookie?: string } = {}) {
    const actor = {
      user: { id: 'user' },
      workspace: { id: 'workspace' },
      sessionId: 'session',
    };
    const principal = {
      userId: 'user',
      workspaceId: 'workspace',
      grantId: 'grant',
      scopes: ['knowledge.read'],
    };
    const sessions = {
      authenticateBrowserCredential: jest.fn(async () => actor),
    };
    const oauth = {
      authenticate: jest.fn(async () => principal),
      origin: 'https://book.example',
    };
    const users = { findById: jest.fn(async () => actor.user) };
    const workspaces = { findById: jest.fn(async () => actor.workspace) };
    const environment = {
      isCloud: () => false,
      getAppSecret: () => localSecret,
    };
    // Register the real Passport JWT strategy so unknown bearer rejection tests
    // execute signature verification instead of stubbing the parent guard.
    new JwtStrategy(
      users as any,
      workspaces as any,
      {} as any,
      {} as any,
      environment as any,
      {} as any,
    );
    const guard = new AgentMcpAuthGuard(
      { getAllAndOverride: () => false } as any,
      environment as any,
      oauth as any,
      users as any,
      workspaces as any,
      sessions as any,
    );
    const request = {
      method: 'POST',
      protocol: 'https',
      headers: {
        host: 'book.example',
        origin: 'https://book.example',
        ...(options.bearer
          ? { authorization: `Bearer ${options.bearer}` }
          : {}),
      },
      cookies: options.cookie ? { authToken: options.cookie } : {},
      raw: { workspaceId: 'workspace', sessionId: undefined },
      user: undefined,
    };
    const response = { header: jest.fn() };
    const context = {
      getHandler: () => null,
      getClass: () => null,
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as any;
    return {
      guard,
      context,
      request,
      oauth,
      sessions,
      users,
      principal,
      actor,
    };
  }
  it('retains independent MCP grants even when a browser identity session is present', async () => {
    const { guard, context, request, oauth, sessions, principal } = harness({
      bearer: 'dma_agent-token',
      cookie: browserToken,
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(oauth.authenticate).toHaveBeenCalledWith(
      'dma_agent-token',
      'https://book.example',
    );
    expect(request.user).toMatchObject({ agent: principal });
    expect(sessions.authenticateBrowserCredential).not.toHaveBeenCalled();
  });
  it('does not let a valid browser cookie rescue a rejected MCP grant', async () => {
    const { guard, context, oauth, sessions } = harness({
      bearer: 'dma_revoked',
      cookie: browserToken,
    });
    oauth.authenticate.mockRejectedValue(new UnauthorizedException());
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(sessions.authenticateBrowserCredential).not.toHaveBeenCalled();
  });
  it('rejects a center-issued JWT as a product/MCP credential using real signature validation', async () => {
    const centerToken = jwt.sign(
      {
        sub: 'center-subject',
        workspaceId: 'workspace',
        type: 'access',
        sessionId: 'session',
      },
      'separate-identity-center-secret',
      { issuer: 'https://id.example', audience: 'docmost', expiresIn: '5m' },
    );
    const { guard, context, oauth, sessions, users } = harness({
      bearer: centerToken,
    });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(oauth.authenticate).not.toHaveBeenCalled();
    expect(sessions.authenticateBrowserCredential).not.toHaveBeenCalled();
    expect(users.findById).not.toHaveBeenCalled();
  });
  it('uses the current protected local browser session when no MCP bearer is supplied', async () => {
    const { guard, context, request, oauth, sessions, actor } = harness({
      cookie: browserToken,
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(sessions.authenticateBrowserCredential).toHaveBeenCalledWith(
      browserToken,
      'workspace',
    );
    expect(request.user).toEqual(actor);
    expect(request.raw.sessionId).toBe('session');
    expect(oauth.authenticate).not.toHaveBeenCalled();
  });
  it('rejects a revoked browser session on the fallback path', async () => {
    const { guard, context, oauth, sessions } = harness({
      cookie: browserToken,
    });
    sessions.authenticateBrowserCredential.mockRejectedValue(
      new UnauthorizedException(),
    );
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(oauth.authenticate).not.toHaveBeenCalled();
  });
});
