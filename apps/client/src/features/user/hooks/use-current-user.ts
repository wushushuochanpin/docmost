import { useQuery, UseQueryResult } from "@tanstack/react-query";
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
    enabled,
  });
}
