import api from "@/lib/api-client";
import { IPagination } from "@/lib/types.ts";
import {
  IApiKey,
  IApiKeyCreateResult,
  IApiKeyListParams,
  ICreateApiKeyInput,
  IRevokeApiKeyInput,
} from "../types/api-key.types.ts";

function getApiKeyPath(
  action: "list" | "create" | "revoke",
  adminView?: boolean,
) {
  return adminView
    ? `/admin/integration-keys/${action}`
    : `/integration-keys/${action}`;
}

export async function getApiKeys(
  params?: IApiKeyListParams,
): Promise<IPagination<IApiKey>> {
  const { adminView, ...payload } = params ?? {};
  const req = await api.post<IPagination<IApiKey>>(
    getApiKeyPath("list", adminView),
    payload,
  );
  return req.data;
}

export async function createApiKey(
  data: ICreateApiKeyInput,
  adminView?: boolean,
): Promise<IApiKeyCreateResult> {
  const req = await api.post<IApiKeyCreateResult>(
    getApiKeyPath("create", adminView),
    data,
  );
  return req.data;
}

export async function revokeApiKey(
  data: IRevokeApiKeyInput,
  adminView?: boolean,
): Promise<void> {
  await api.post(getApiKeyPath("revoke", adminView), data);
}
