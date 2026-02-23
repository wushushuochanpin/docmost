import { EditorFontSize } from "@/features/user/types/user.types";

export const editorFontScaleMap: Record<EditorFontSize, string> = {
  [EditorFontSize.Small]: "0.95",
  [EditorFontSize.Normal]: "1",
  [EditorFontSize.Large]: "1.15",
};

export const getEditorFontScale = (
  editorFontSize: EditorFontSize | string | undefined | null,
) => {
  if (
    editorFontSize === EditorFontSize.Small ||
    editorFontSize === EditorFontSize.Normal ||
    editorFontSize === EditorFontSize.Large
  ) {
    return editorFontScaleMap[editorFontSize];
  }

  return editorFontScaleMap[EditorFontSize.Normal];
};
