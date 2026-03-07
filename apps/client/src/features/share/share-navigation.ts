export const SHARE_SCROLL_TO_HEADING_EVENT = "share:scroll-to-heading";
export const SHARE_CONTENT_UPDATED_EVENT = "share:content-updated";

export interface ShareScrollToHeadingDetail {
  id: string;
  behavior?: ScrollBehavior;
  segmentIndex?: number;
}

export interface ShareContentUpdatedDetail {
  contentHash: string;
  segmentIndex: number;
}

export function requestShareScrollToHeading(
  detail: ShareScrollToHeadingDetail,
): void {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<ShareScrollToHeadingDetail>(SHARE_SCROLL_TO_HEADING_EVENT, {
      detail,
    }),
  );
}

export function notifyShareContentUpdated(
  detail: ShareContentUpdatedDetail,
): void {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<ShareContentUpdatedDetail>(SHARE_CONTENT_UPDATED_EVENT, {
      detail,
    }),
  );
}
