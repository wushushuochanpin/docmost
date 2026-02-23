import { EditorFontSize } from "@/features/user/types/user.types";

export const editorFontScaleMap: Record<EditorFontSize, string> = {
  [EditorFontSize.Small]: "0.9",
  [EditorFontSize.Normal]: "1",
  [EditorFontSize.Large]: "1.1",
};

export const getEditorFontScale = (
  editorFontSize: EditorFontSize | string | undefined | null,
) => {
  const normalized = normalizeEditorFontSize(editorFontSize);
  if (normalized) {
    return editorFontScaleMap[normalized];
  }

  return editorFontScaleMap[EditorFontSize.Normal];
};

export const normalizeEditorFontSize = (
  editorFontSize: EditorFontSize | string | undefined | null,
): EditorFontSize | undefined => {
  const candidate =
    typeof editorFontSize === "string" ? editorFontSize.toLowerCase() : "";

  if (
    candidate === EditorFontSize.Small ||
    candidate === EditorFontSize.Normal ||
    candidate === EditorFontSize.Large
  ) {
    return candidate;
  }

  return undefined;
};

export const extractEditorFontSizeFromUser = (user?: {
  settings?: {
    preferences?: {
      editorFontSize?: string | null;
    };
  };
  editorFontSize?: string | null;
}) => {
  return (
    normalizeEditorFontSize(user?.settings?.preferences?.editorFontSize) ||
    normalizeEditorFontSize(user?.editorFontSize) ||
    undefined
  );
};
