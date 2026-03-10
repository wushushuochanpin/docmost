import type { ISharedPageRendered } from "@/features/share/types/share.types.ts";

export function canUseStaticRenderedHtml(
  rendered?: ISharedPageRendered | null,
): boolean {
  if (!rendered) {
    return false;
  }

  if (rendered.legacyFallbackReason) {
    return false;
  }

  return Boolean(rendered.html || rendered.headHtml);
}
