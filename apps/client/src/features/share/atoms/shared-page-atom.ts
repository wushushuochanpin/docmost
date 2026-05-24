import type { SetStateAction } from "react";
import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { ISharedPageTree } from "@/features/share/types/share.types";
import { SharedPageTreeNode } from "@/features/share/utils";
import { ISharedPageRenderedTocItem } from "@/features/share/types/share.types";

const SHARE_ACCESS_STORAGE_KEY = "docmost:share-access-tokens";

function getStoredShareAccessTokens(): Record<string, string> {
  if (typeof sessionStorage === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(SHARE_ACCESS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const result: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof k === "string" && typeof v === "string") result[k] = v;
      }
      return result;
    }
  } catch {
    // ignore
  }
  return {};
}

function persistShareAccessTokens(tokens: Record<string, string>) {
  try {
    sessionStorage.setItem(SHARE_ACCESS_STORAGE_KEY, JSON.stringify(tokens));
  } catch {
    // ignore
  }
}

export interface SharedShellState {
  includeSubPages: boolean;
  hasLicenseKey: boolean;
  canUseSearch: boolean;
  renderMode: "editor" | "html";
  toc: ISharedPageRenderedTocItem[];
}

export interface SharedPageTreeRequestState {
  status: "idle" | "loading" | "success" | "error";
  errorMessage: string | null;
}

export const sharedPageTreeAtom = atom(null as ISharedPageTree | null);
export const sharedTreeDataAtom = atom(null as SharedPageTreeNode[] | null);

export const sharedAccessTokenAtom = atom(
  getStoredShareAccessTokens(),
  (_get, set, update: SetStateAction<Record<string, string>>) => {
    const prev = _get(sharedAccessTokenAtom);
    const next =
      typeof update === "function"
        ? (update as (prev: Record<string, string>) => Record<string, string>)(
            prev,
          )
        : update;
    persistShareAccessTokens(next);
    set(sharedAccessTokenAtom, next);
  },
);
export const sharedShellStateAtom = atom(null as SharedShellState | null);
export const sharedPageTreeRequestStateAtom = atom<SharedPageTreeRequestState>({
  status: "idle",
  errorMessage: null,
});

/** When true, ShareShell hides header and shows only full-viewport centered content (e.g. password form). */
export const sharedFullScreenAtom = atom(false);

export const sharedPageFullWidthAtom = atomWithStorage<boolean>(
  "sharedPageFullWidth",
  false,
);
