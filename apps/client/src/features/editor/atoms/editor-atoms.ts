import { atom } from "jotai";
import { Editor } from "@tiptap/core";

export const pageEditorAtom = atom<Editor | null>(null);

export type PageEditorRuntimeMode = "preview" | "local" | "collab";

export const titleEditorAtom = atom<Editor | null>(null);

export const readOnlyEditorAtom = atom<Editor | null>(null);

export const yjsConnectionStatusAtom = atom<string>("");

export const pageEditorRuntimeModeAtom = atom<PageEditorRuntimeMode>("preview");

export const showAiMenuAtom = atom(false);
