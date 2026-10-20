export const settingsRouteLoaders = {
  agentConnections: () =>
    import("@/features/agent-connections/connections-page"),
  agentConnectionDetail: () =>
    import("@/features/agent-connections/detail-page"),
  agentPolicy: () => import("@/features/agent-connections/policy-page"),
  agentActivity: () => import("@/features/agent-connections/activity-page"),
  accountProfile: () => import("@/pages/settings/account/account-settings"),
  accountPreferences: () =>
    import("@/pages/settings/account/account-preferences.tsx"),
  accountApiKeys: () =>
    import("@/features/compliance-admin/api-keys/pages/user-api-keys.tsx"),
  workspace: () => import("@/pages/settings/workspace/workspace-settings"),
  members: () => import("@/pages/settings/workspace/workspace-members"),
  workspaceApiKeys: () =>
    import("@/features/compliance-admin/api-keys/pages/workspace-api-keys.tsx"),
  groups: () => import("@/pages/settings/group/groups"),
  groupInfo: () => import("@/pages/settings/group/group-info"),
  spaces: () => import("@/pages/settings/space/spaces.tsx"),
  sharing: () => import("@/pages/settings/shares/shares.tsx"),
  security: () => import("@/ee/security/pages/security.tsx"),
  ai: () => import("@/ee/ai/pages/ai-settings.tsx"),
  audit: () => import("@/features/compliance-admin/audit/pages/audit-logs.tsx"),
  verifications: () =>
    import("@/ee/page-verification/pages/verified-pages.tsx"),
  backup: () => import("@/pages/settings/backup/backup"),
  license: () => import("@/ee/licence/pages/license.tsx"),
  billing: () => import("@/ee/billing/pages/billing.tsx"),
} as const;

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
