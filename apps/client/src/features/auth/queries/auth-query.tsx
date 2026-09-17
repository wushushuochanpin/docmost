import {
  useQuery,
  UseQueryOptions,
  UseQueryResult,
} from "@tanstack/react-query";
import { getCollabToken, verifyUserToken } from "../services/auth-service";
import { ICollabToken, IVerifyUserToken } from "../types/auth.types";
import { isAxiosError } from "axios";
import { isEditorSessionEnabled } from "@/lib/config";
import { queryClient } from "@/query-client";

export function useVerifyUserTokenQuery(
  verify: IVerifyUserToken,
): UseQueryResult<any, Error> {
  return useQuery({
    queryKey: ["verify-token", verify],
    queryFn: () => verifyUserToken(verify),
    enabled: !!verify.token,
    staleTime: 0,
  });
}

/**
 * Collab token is a workspace-scoped JWT valid for 24h (server-side) and bound
 * to the auth session, not to a specific page or editor session. It is safe to
 * cache for the duration of a browsing session, so we prefetch it as soon as a
 * page route mounts (in parallel with /pages/info) and reuse it across page
 * navigations instead of re-issuing a token on every editor mount.
 */
export const collabTokenQueryKey = ["collab-token"] as const;

export const COLLAB_TOKEN_CACHE_MS = 10 * 60 * 1000; // token is valid 24h; 10min client cache

export function collabTokenQueryOptions(
  options: { enabled?: boolean } = {},
): UseQueryOptions<ICollabToken, Error, ICollabToken, typeof collabTokenQueryKey> {
  const editorSessionEnabled = isEditorSessionEnabled();
  const { enabled = true } = options;

  return {
    queryKey: collabTokenQueryKey,
    queryFn: () => getCollabToken(),
    enabled,
    staleTime: editorSessionEnabled ? COLLAB_TOKEN_CACHE_MS : 20 * 60 * 60 * 1000, //20hrs
    refetchOnMount: editorSessionEnabled ? false : true,
    retry: (failureCount: number, error: unknown) => {
      if (isAxiosError(error) && error.response.status === 404) {
        return false;
      }
      // Retry up to 10 times with exponential backoff (see retryDelay below).
      return failureCount < 10;
    },
    retryDelay: (retryAttempt: number) => {
      // Exponential backoff: 5s, 10s, 20s, etc.
      return 5000 * Math.pow(2, retryAttempt - 1);
    },
  };
}

export function useCollabToken(
  options: { enabled?: boolean } = {},
): UseQueryResult<ICollabToken, Error> {
  return useQuery(collabTokenQueryOptions(options));
}

/** Fire collab-token fetch early so the editor mount does not wait for it. */
export function prefetchCollabToken(options: { enabled?: boolean } = {}) {
  return queryClient.prefetchQuery(collabTokenQueryOptions(options));
}
