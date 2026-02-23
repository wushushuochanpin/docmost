import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom";
import {
  EditorFontSize,
  PageEditMode,
} from "@/features/user/types/user.types";
import { normalizeEditorFontSize } from "@/features/editor/utils/editor-font-size-utils";

export interface EditorViewPreferences {
  editorFontSize?: EditorFontSize;
  pageEditMode?: PageEditMode;
}

const resolvePreferenceKey = (userId?: string) =>
  userId ? `user:${userId}` : "anonymous";

const getEmptyPreferences = (): EditorViewPreferences => ({});

export const editorViewPreferencesAtom = atomWithStorage<
  Record<string, EditorViewPreferences>
>("editorViewPreferences", {});

export const editorFontSizePreferenceAtom = atom(
  (get) => {
    const currentUser = get(currentUserAtom);
    const key = resolvePreferenceKey(currentUser?.user?.id);
    const storage = get(editorViewPreferencesAtom) || {};
    return normalizeEditorFontSize(storage[key]?.editorFontSize);
  },
  (get, set, next: EditorFontSize) => {
    const currentUser = get(currentUserAtom);
    const key = resolvePreferenceKey(currentUser?.user?.id);
    const storage = get(editorViewPreferencesAtom) || {};
    const current = storage[key] ?? getEmptyPreferences();
    set(editorViewPreferencesAtom, {
      ...storage,
      [key]: {
        ...current,
        editorFontSize: normalizeEditorFontSize(next) ?? current.editorFontSize,
      },
    });
  },
);

export const pageEditModePreferenceAtom = atom(
  (get) => {
    const currentUser = get(currentUserAtom);
    const key = resolvePreferenceKey(currentUser?.user?.id);
    const storage = get(editorViewPreferencesAtom) || {};
    const candidate = storage[key]?.pageEditMode;

    if (
      candidate === PageEditMode.Edit ||
      candidate === PageEditMode.Read
    ) {
      return candidate;
    }

    return undefined;
  },
  (get, set, next: PageEditMode) => {
    const currentUser = get(currentUserAtom);
    const key = resolvePreferenceKey(currentUser?.user?.id);
    const storage = get(editorViewPreferencesAtom) || {};
    const current = storage[key] ?? getEmptyPreferences();
    set(editorViewPreferencesAtom, {
      ...storage,
      [key]: {
        ...current,
        pageEditMode: next,
      },
    });
  },
);
