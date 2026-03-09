import RenderedHtmlDocument, {
  type RenderedHtmlDocumentClassNames,
} from "@/features/rendered-page/components/rendered-html-document.tsx";
import type {
  ISharedPageRendered,
  ISharedPageRenderedSegment,
} from "@/features/share/types/share.types.ts";
import classes from "./page-static-html-content.module.css";

interface PageStaticHtmlContentProps {
  title: string;
  rendered: ISharedPageRendered;
  loadSegment?: (cursor: string) => Promise<ISharedPageRenderedSegment>;
  fontScale?: string | number;
}

const pageClassNames: RenderedHtmlDocumentClassNames = {
  layout: classes.layout,
  titleSection: classes.titleSection,
  title: classes.pageTitle,
  article: classes.article,
  segmentStatus: classes.segmentStatus,
};

export default function PageStaticHtmlContent({
  title,
  rendered,
  loadSegment,
  fontScale,
}: PageStaticHtmlContentProps) {
  return (
    <RenderedHtmlDocument
      title={title}
      rendered={rendered}
      loadSegment={loadSegment}
      fontScale={fontScale}
      classNames={pageClassNames}
    />
  );
}
