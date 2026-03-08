import { QueryParams } from "@/lib/types.ts";

export interface IApiKeyListParams extends QueryParams {
  adminView?: boolean;
}

export interface IApiKeyActor {
  id: string;
  name: string | null;
  email: string | null;
}

export interface IApiKey {
  id: string;
  name: string;
  tokenPrefix: string;
  status: string;
  isWorkspaceManaged: boolean;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  creatorId?: string;
  creatorName?: string | null;
  creatorEmail?: string | null;
  ownerUserId?: string;
  ownerName?: string | null;
  ownerEmail?: string | null;
}

export interface ICreateApiKeyInput {
  name: string;
  expiresAt?: string | null;
}

export interface IRevokeApiKeyInput {
  tokenId: string;
}

export interface IApiKeyCreateResult {
  id: string;
  name: string;
  token: string;
  tokenPrefix: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  isWorkspaceManaged: boolean;
  creator?: IApiKeyActor;
  owner?: IApiKeyActor;
  status: string;
}
