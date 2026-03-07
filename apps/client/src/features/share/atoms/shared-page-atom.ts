import { atom } from "jotai";
import { ISharedPageTree } from "@/features/share/types/share.types";
import { SharedPageTreeNode } from "@/features/share/utils";
import { ISharedPageRenderedTocItem } from "@/features/share/types/share.types";

export interface SharedShellState {
  includeSubPages: boolean;
  hasLicenseKey: boolean;
  canUseSearch: boolean;
  renderMode: "editor" | "html";
  toc: ISharedPageRenderedTocItem[];
}

export const sharedPageTreeAtom = atom(null as ISharedPageTree | null);
export const sharedTreeDataAtom = atom(null as SharedPageTreeNode[] | null);
export const sharedAccessTokenAtom = atom({} as Record<string, string>);
export const sharedShellStateAtom = atom(null as SharedShellState | null);
