import { atomWithStorage } from "jotai/utils";

export const recentSpaceSlugAtom = atomWithStorage<string | null>(
  "recent-space-slug",
  null,
);
