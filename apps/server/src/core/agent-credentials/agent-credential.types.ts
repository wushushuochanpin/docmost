/**
 * Normalized credential used by every agent-facing surface.
 *
 * OAuth grants and MCP-scoped API tokens intentionally keep separate storage;
 * this is only the request/commit-time projection. The persisted credential is
 * always re-read inside the document transaction before a write commits.
 */
export type AgentCredentialKind = 'oauth' | 'api_token';

export type AgentCredential = {
  kind: AgentCredentialKind;
  credentialId: string;
  workspaceId: string;
  userId: string;
  tokenHash: string;
  scopes: string[];
  spaceIds: string[];
  version: string;
  grantId?: string;
  clientId?: string;
  apiTokenId?: string;
};

export const knowledgeScopes = ['knowledge.read'] as const;
