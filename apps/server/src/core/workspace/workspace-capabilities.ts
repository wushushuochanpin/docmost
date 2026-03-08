export type WorkspaceCapabilities = {
  integrationTokens: boolean;
  workspaceTokenManagement: boolean;
  securityPolicies: boolean;
  identityProviders: boolean;
  auditLogs: boolean;
  sourceCodeAccess: boolean;
};

export function getWorkspaceCapabilities(opts: {
  isCloud: boolean;
  hasLicenseKey: boolean;
}): WorkspaceCapabilities {
  const { isCloud, hasLicenseKey } = opts;
  const hasEnterpriseAccess = isCloud || hasLicenseKey;

  return {
    integrationTokens: !isCloud || hasEnterpriseAccess,
    workspaceTokenManagement: !isCloud || hasEnterpriseAccess,
    securityPolicies: hasEnterpriseAccess,
    identityProviders: hasEnterpriseAccess,
    auditLogs: !isCloud || hasEnterpriseAccess,
    sourceCodeAccess: !isCloud,
  };
}

export function buildWorkspaceClientState<
  T extends { licenseKey?: string | null | undefined },
>(
  workspace: T,
  opts: {
    isCloud: boolean;
    memberCount?: number;
  },
) {
  const { licenseKey, ...rest } = workspace;
  const hasLicenseKey = Boolean(licenseKey);

  return {
    ...rest,
    ...(typeof opts.memberCount === 'number'
      ? { memberCount: opts.memberCount }
      : {}),
    hasLicenseKey,
    capabilities: getWorkspaceCapabilities({
      isCloud: opts.isCloud,
      hasLicenseKey,
    }),
  };
}
