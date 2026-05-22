import { atom } from "jotai";
import { Editor } from "@tiptap/core";
import type { EditSession } from "@/features/editor-session/types";

export const pageEditorAtom = atom<Editor | null>(null);

export type PageEditorRuntimeMode = "preview" | "local" | "collab";
export type PageEditorCollaborationStatus =
  | "disabled"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "local"
  | "error";
export type PageEditorCollaborationDisabledReason =
  | "instance"
  | "workspace"
  | null;
export type PageEditorSessionStatus =
  | "disabled"
  | "active"
  | "blocked_by_other"
  | "pending_takeover"
  | "takeover_requested"
  | "revoked";

export const titleEditorAtom = atom<Editor | null>(null);

export const readOnlyEditorAtom = atom<Editor | null>(null);

export const yjsConnectionStatusAtom = atom<string>("");

export const pageEditorRuntimeModeAtom = atom<PageEditorRuntimeMode>("preview");
export const pageEditorCollaborationStatusAtom =
  atom<PageEditorCollaborationStatus>("disabled");

/** Folder/title-only views have no PageEditor; "disabled" means no active lease. */
export function isPageEditorSessionWritable(
  editorSessionFeatureEnabled: boolean,
  pageEditorSessionStatus: PageEditorSessionStatus,
): boolean {
  if (!editorSessionFeatureEnabled) {
    return true;
  }

  return (
    pageEditorSessionStatus === "active" ||
    pageEditorSessionStatus === "disabled"
  );
}
export const pageEditorSessionStatusAtom =
  atom<PageEditorSessionStatus>("disabled");
export const pageEditorEditSessionAtom = atom<EditSession | undefined>(
  undefined,
);

export const showAiMenuAtom = atom(false);

export const showLinkMenuAtom = atom(false);
