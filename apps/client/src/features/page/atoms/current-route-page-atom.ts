import { atom } from "jotai";
import { IPage } from "@/features/page/types/page.types.ts";

export const currentRoutePageAtom = atom<IPage | null>(null);
