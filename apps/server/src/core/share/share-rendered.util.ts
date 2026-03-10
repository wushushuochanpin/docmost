type StaticRenderedPayload = {
  html?: string | null;
  headHtml?: string | null;
  legacyFallbackReason?: string | null;
};

export function canUseStaticShareRender(
  rendered?: StaticRenderedPayload | null,
): boolean {
  if (!rendered) {
    return false;
  }

  if (rendered.legacyFallbackReason) {
    return false;
  }

  return Boolean(rendered.html || rendered.headHtml);
}
