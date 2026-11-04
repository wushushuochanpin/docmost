import api from "@/lib/api-client";

export type McpScope =
  | "knowledge.read"
  | "pages.create"
  | "folders.create"
  | "pages.edit";

export type McpToken = {
  id: string;
  name: string;
  credentialType: "mcp_scoped";
  scopes: McpScope[];
  spaceIds: string[];
  spaces: { id: string; name: string }[];
  version: string;
  status: "active" | "revoked" | "expired";
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
};

export type McpTokenPage = {
  items: McpToken[];
  next_cursor: string | null;
  csrf_token: string;
};

export type McpCapabilities = {
  enabled: boolean;
  scopes: McpScope[];
  default_scopes: McpScope[];
  spaces: { id: string; name: string }[];
  writes_enabled: boolean;
  max_expiry_days: number;
  csrf_token: string;
};

export type CreatedMcpToken = McpToken & { token: string };

export const mcpScopeLabels: Record<McpScope, string> = {
  "knowledge.read": "读取文档",
  "pages.create": "新建文档",
  "folders.create": "新建文件夹",
  "pages.edit": "编辑文档",
};

export async function getMcpCapabilities(): Promise<McpCapabilities> {
  const response = await api.get<any>("/integration-keys/mcp/capabilities");
  return response.data;
}

export async function listMcpTokens(params: {
  cursor?: string;
  page_size?: number;
}): Promise<McpTokenPage> {
  const response = await api.post<any>("/integration-keys/mcp/list", {
    cursor: params.cursor,
    page_size: params.page_size ?? 20,
  });
  return response.data;
}

export async function getMcpToken(id: string): Promise<McpToken> {
  const response = await api.get<any>(`/integration-keys/mcp/${id}`);
  return response.data;
}

export async function createMcpToken(
  payload: {
    name: string;
    expiresAt: string | null;
    spaceIds: string[];
    scopes: McpScope[];
    requestId: string;
  },
  csrf: string,
): Promise<CreatedMcpToken> {
  const response = await api.post<any>("/integration-keys/mcp/create", payload, {
    headers: { "X-CSRF-Token": csrf },
  });
  return response.data;
}

export async function updateMcpToken(
  payload: {
    tokenId: string;
    expectedVersion: string;
    spaceIds: string[];
    scopes: McpScope[];
    confirmUpgrade: boolean;
  },
  csrf: string,
): Promise<McpToken> {
  const response = await api.post<any>("/integration-keys/mcp/update", payload, {
    headers: { "X-CSRF-Token": csrf },
  });
  return response.data;
}

export async function revokeMcpToken(
  tokenId: string,
  csrf: string,
): Promise<{ id: string; status: string }> {
  const response = await api.post<any>(
    "/integration-keys/mcp/revoke",
    { tokenId },
    { headers: { "X-CSRF-Token": csrf } },
  );
  return response.data;
}
