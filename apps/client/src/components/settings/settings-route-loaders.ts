import { preloadableLazyWithRetry } from "@/lib/lazy-import.ts";

export const settingsRouteModules = {
  agentConnections: preloadableLazyWithRetry(
    () => import("@/features/agent-connections/connections-page"),
  ),
  agentConnectionDetail: preloadableLazyWithRetry(
    () => import("@/features/agent-connections/detail-page"),
  ),
  agentPolicy: preloadableLazyWithRetry(
    () => import("@/features/agent-connections/policy-page"),
  ),
  agentActivity: preloadableLazyWithRetry(
    () => import("@/features/agent-connections/activity-page"),
  ),
  accountProfile: preloadableLazyWithRetry(
    () => import("@/pages/settings/account/account-settings"),
  ),
  accountPreferences: preloadableLazyWithRetry(
    () => import("@/pages/settings/account/account-preferences.tsx"),
  ),
  accountApiKeys: preloadableLazyWithRetry(
    () =>
      import("@/features/compliance-admin/api-keys/pages/user-api-keys.tsx"),
  ),
  workspace: preloadableLazyWithRetry(
    () => import("@/pages/settings/workspace/workspace-settings"),
  ),
  members: preloadableLazyWithRetry(
    () => import("@/pages/settings/workspace/workspace-members"),
  ),
  workspaceApiKeys: preloadableLazyWithRetry(
    () =>
      import("@/features/compliance-admin/api-keys/pages/workspace-api-keys.tsx"),
  ),
  groups: preloadableLazyWithRetry(
    () => import("@/pages/settings/group/groups"),
  ),
  groupInfo: preloadableLazyWithRetry(
    () => import("@/pages/settings/group/group-info"),
  ),
  spaces: preloadableLazyWithRetry(
    () => import("@/pages/settings/space/spaces.tsx"),
  ),
  sharing: preloadableLazyWithRetry(
    () => import("@/pages/settings/shares/shares.tsx"),
  ),
  security: preloadableLazyWithRetry(
    () => import("@/ee/security/pages/security.tsx"),
  ),
  ai: preloadableLazyWithRetry(() => import("@/ee/ai/pages/ai-settings.tsx")),
  audit: preloadableLazyWithRetry(
    () => import("@/features/compliance-admin/audit/pages/audit-logs.tsx"),
  ),
  verifications: preloadableLazyWithRetry(
    () => import("@/ee/page-verification/pages/verified-pages.tsx"),
  ),
  backup: preloadableLazyWithRetry(
    () => import("@/pages/settings/backup/backup"),
  ),
  license: preloadableLazyWithRetry(
    () => import("@/ee/licence/pages/license.tsx"),
  ),
  billing: preloadableLazyWithRetry(
    () => import("@/ee/billing/pages/billing.tsx"),
  ),
} as const;

export const settingsRouteLoaders = Object.fromEntries(
  Object.entries(settingsRouteModules).map(([key, route]) => [
    key,
    route.preload,
  ]),
) as {
  [Key in keyof typeof settingsRouteModules]: (typeof settingsRouteModules)[Key]["preload"];
};

export type SettingsRouteLoader =
  (typeof settingsRouteLoaders)[keyof typeof settingsRouteLoaders];

export function preloadSettingsRoute(loader?: SettingsRouteLoader) {
  if (!loader) return Promise.resolve();

  return loader().then(
    () => undefined,
    () => {
      // Navigation uses lazyWithRetry and the app error boundary. A speculative
      // preload failure must not create an unhandled rejection.
    },
  );
}
