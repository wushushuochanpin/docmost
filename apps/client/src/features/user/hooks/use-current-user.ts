import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { getMyInfo } from "@/features/user/services/user-service";
import { ICurrentUser } from "@/features/user/types/user.types";

interface UseCurrentUserOptions {
  enabled?: boolean;
}

export default function useCurrentUser(
  options: UseCurrentUserOptions = {},
): UseQueryResult<ICurrentUser> {
  const { enabled = true } = options;

  return useQuery({
    queryKey: ["currentUser"],
    queryFn: async () => {
      return await getMyInfo();
    },
    // A temporarily unanswered identity check is retryable and must not be
    // mistaken for an expired/revoked session.
    retry: (failureCount, error) =>
      isAxiosError(error) &&
      (error.response?.status === 503 ||
        (error.response?.data?.code ?? error.response?.data?.message) ===
          "identity_unavailable") &&
      failureCount < 3,
    retryDelay: (attempt) => Math.min(5_000 * 2 ** attempt, 15_000),
    enabled,
  });
}
