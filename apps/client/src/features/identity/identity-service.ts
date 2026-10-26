import api from "@/lib/api-client";
import { withAuthCookieLock } from "@/features/auth/auth-cookie-lock";

export interface IdentityStatus {
  enabled: boolean;
}

export interface IdentityAccount extends IdentityStatus {
  linked: boolean;
}

export async function getIdentityStatus(): Promise<IdentityStatus> {
  const response = await api.get<IdentityStatus>("/identity/status");
  return response.data;
}

export async function bootstrapIdentity(): Promise<{
  ready: boolean;
  authenticated: boolean;
}> {
  const response = await api.post<{ ready: boolean; authenticated: boolean }>(
    "/identity/bootstrap",
  );
  return response.data;
}

export async function getIdentityAccount(): Promise<IdentityAccount> {
  const response = await api.get<IdentityAccount>("/identity/account");
  return response.data;
}

export async function startIdentityLink(
  password: string,
): Promise<{ url: string }> {
  const response = await withAuthCookieLock(() => api.post<{ url: string }>("/identity/link/start", {
    password,
    returnTo: "/settings/account/profile",
  }), true);
  return response.data;
}
