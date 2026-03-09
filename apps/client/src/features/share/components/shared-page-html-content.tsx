import { useCallback } from "react";
import RenderedHtmlDocument, {
  type RenderedHtmlDocumentClassNames,
} from "@/features/rendered-page/components/rendered-html-document.tsx";
import { getSharePageSegment } from "@/features/share/services/share-service.ts";
import type { ISharedPageRendered } from "@/features/share/types/share.types.ts";
import classes from "./shared-page-html-content.module.css";

interface SharedPageHtmlContentProps {
  title: string;
  pageId: string;
  rendered: ISharedPageRendered;
  shareId?: string;
  accessToken?: string;
}

const shareClassNames: RenderedHtmlDocumentClassNames = {
  layout: classes.layout,
  titleSection: classes.titleSection,
  title: classes.pageTitle,
  article: classes.article,
  segmentStatus: classes.segmentStatus,
};

export default function SharedPageHtmlContent({
  title,
  pageId,
  rendered,
  shareId,
  accessToken,
}: SharedPageHtmlContentProps) {
  const loadSegment = useCallback(
    (cursor: string) =>
      getSharePageSegment({
        shareId,
        pageId,
        accessToken,
        cursor,
      }),
    [accessToken, pageId, shareId],
  );

  return (
    <RenderedHtmlDocument
      title={title}
      rendered={rendered}
      loadSegment={loadSegment}
      classNames={shareClassNames}
    />
  );
}
