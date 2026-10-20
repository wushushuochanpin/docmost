import { queryClient } from "@/query-client.ts";
import {
  getBilling,
  getBillingPlans,
} from "@/ee/billing/services/billing-service.ts";
import { getSpaces } from "@/features/space/services/space-service.ts";
import { getGroups } from "@/features/group/services/group-service.ts";
import { QueryParams } from "@/lib/types.ts";
import { getWorkspaceMembers } from "@/features/workspace/services/workspace-service.ts";
import { getLicenseInfo } from "@/ee/licence/services/license-service.ts";
import { getSsoProviders } from "@/ee/security/services/security-service.ts";
import { getShares } from "@/features/share/services/share-service.ts";
import { getApiKeys } from "@/features/compliance-admin/api-keys";
import { getAuditLogs } from "@/features/compliance-admin/audit";
import { getVerificationList } from "@/ee/page-verification/services/page-verification-service";
import { getScimTokens } from "@/ee/scim/services/scim-token-service";
import type { IVerificationListParams } from "@/ee/page-verification/types/page-verification.types.ts";

export const prefetchWorkspaceMembers = () => {
  const params: QueryParams = { limit: 100, query: "" };
  queryClient.prefetchQuery({
    queryKey: ["workspaceMembers", params],
    queryFn: () => getWorkspaceMembers(params),
  });
};

export const prefetchSpaces = () => {
  const params = { cursor: undefined, query: "" };
  queryClient.prefetchQuery({
    queryKey: ["spaces", params],
    queryFn: () => getSpaces(params),
  });
};

export const prefetchGroups = () => {
  const params = { cursor: undefined, query: "" };
  queryClient.prefetchQuery({
    queryKey: ["groups", params],
    queryFn: () => getGroups(params),
  });
};

export const prefetchBilling = () => {
  queryClient.prefetchQuery({
    queryKey: ["billing"],
    queryFn: () => getBilling(),
  });

  queryClient.prefetchQuery({
    queryKey: ["billing-plans"],
    queryFn: () => getBillingPlans(),
  });
};

export const prefetchLicense = () => {
  queryClient.prefetchQuery({
    queryKey: ["license"],
    queryFn: () => getLicenseInfo(),
  });
};

export const prefetchSsoProviders = () => {
  queryClient.prefetchQuery({
    queryKey: ["sso-providers"],
    queryFn: () => getSsoProviders(),
  });
};

export const prefetchShares = () => {
  queryClient.prefetchQuery({
    queryKey: ["share-list", {}],
    queryFn: () => getShares({}),
  });
};

export const prefetchApiKeys = () => {
  const params = {
    limit: 20,
    query: "",
    cursor: undefined,
    beforeCursor: undefined,
  };
  queryClient.prefetchQuery({
    queryKey: ["api-key-list", params],
    queryFn: () => getApiKeys(params),
  });
};

export const prefetchApiKeyManagement = () => {
  const params = {
    limit: 20,
    query: "",
    cursor: undefined,
    beforeCursor: undefined,
    adminView: true,
  };
  queryClient.prefetchQuery({
    queryKey: ["api-key-list", params],
    queryFn: () => getApiKeys(params),
  });
};

export const prefetchAuditLogs = () => {
  const params = { limit: 50 };
  queryClient.prefetchQuery({
    queryKey: ["audit-logs", params],
    queryFn: () => getAuditLogs(params),
  });
};

export const prefetchVerifiedPages = () => {
  const params: IVerificationListParams = {
    cursor: undefined,
    limit: 50,
    spaceIds: undefined,
    type: null as IVerificationListParams["type"],
    query: undefined,
  };
  queryClient.prefetchQuery({
    queryKey: ["verification-list", params],
    queryFn: () => getVerificationList(params),
  });

  const spacesParams = { limit: 100 };
  queryClient.prefetchQuery({
    queryKey: ["spaces", spacesParams],
    queryFn: () => getSpaces(spacesParams),
  });
};

export const prefetchScimTokens = () => {
  queryClient.prefetchQuery({
    queryKey: ["scim-token-list", { cursor: undefined }],
    queryFn: () => getScimTokens({}),
  });
};
