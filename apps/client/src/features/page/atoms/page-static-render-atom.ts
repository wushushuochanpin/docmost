import { atom } from "jotai";
import { ISharedPageRenderedTocItem } from "@/features/share/types/share.types.ts";

export const pageStaticTocAtom = atom<ISharedPageRenderedTocItem[]>([]);
