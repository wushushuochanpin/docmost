import { atomWithWebStorage } from "@/lib/jotai-helper.ts";
import { atom } from 'jotai';

export const shareDesktopSidebarAtom = atomWithWebStorage<boolean>(
  "showShareSidebar",
  false,
);

export const tableOfContentAsideAtom = atomWithWebStorage<boolean>(
  "showShareTOC",
  false,
);

export const mobileTableOfContentAsideAtom = atom<boolean>(false);
