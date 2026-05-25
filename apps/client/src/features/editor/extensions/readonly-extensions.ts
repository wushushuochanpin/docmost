import { createElement, lazy, Suspense } from "react";
import { StarterKit } from "@tiptap/starter-kit";
import { TextAlign } from "@tiptap/extension-text-align";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Superscript } from "@tiptap/extension-superscript";
import SubScript from "@tiptap/extension-subscript";
import { Typography } from "@tiptap/extension-typography";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { Heading } from "@docmost/editor-ext/src/lib/heading/heading.ts";
import { Highlight } from "@docmost/editor-ext/src/lib/highlight.ts";
import { LinkExtension } from "@docmost/editor-ext/src/lib/link.ts";
import { SharedStorage } from "@docmost/editor-ext/src/lib/shared-storage/shared-storage.ts";
import { UniqueID } from "@docmost/editor-ext/src/lib/unique-id/unique-id.ts";
import { ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";

const RARE_EXTENSION_FEATURES = [
  "attachment",
  "audio",
  "callout",
  "codeBlock",
  "comment",
  "details",
  "detailsContent",
  "detailsSummary",
  "drawio",
  "embed",
  "excalidraw",
  "image",
  "mathBlock",
  "mathInline",
  "mention",
  "subpages",
  "table",
  "tableCell",
  "tableHeader",
  "tableRow",
  "video",
  "youtube",
] as const;

function createLazyNodeView(
  loader: () => Promise<{ default: React.ComponentType<NodeViewProps> }>,
) {
  const LazyNodeView = lazy(loader);

  return function DeferredNodeView(props: NodeViewProps) {
    return createElement(
      Suspense,
      { fallback: null },
      createElement(LazyNodeView, props),
    );
  };
}

function collectContentFeatures(content: any) {
  const features = new Set<string>();

  if (!content || typeof content !== "object") {
    for (const feature of RARE_EXTENSION_FEATURES) {
      features.add(feature);
    }
    return features;
  }

  const visit = (node: any) => {
    if (!node || typeof node !== "object") {
      return;
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }

    if (typeof node.type === "string") {
      features.add(node.type);
    }

    if (Array.isArray(node.marks)) {
      for (const mark of node.marks) {
        if (mark && typeof mark.type === "string") {
          features.add(mark.type);
        }
      }
    }

    if (Array.isArray(node.content)) {
      visit(node.content);
    }
  };

  visit(content);
  return features;
}

const readonlyMentionSuggestion = {
  allowSpaces: true,
  items: () => [],
  render: () => ({
    onStart: () => {},
    onUpdate: () => {},
    onExit: () => {},
    onKeyDown: () => false,
  }),
};

async function loadCommentExtension() {
  const { Comment } =
    await import("@docmost/editor-ext/src/lib/comment/comment.ts");

  return [
    Comment.configure({
      HTMLAttributes: {
        class: "comment-mark",
      },
    }),
  ];
}

async function loadMentionExtension() {
  const { Mention } = await import("@docmost/editor-ext/src/lib/mention.ts");
  const LazyReadonlyMentionView = createLazyNodeView(
    () =>
      import("@/features/editor/components/mention/readonly-mention-view.tsx"),
  );

  return [
    Mention.configure({
      suggestion: readonlyMentionSuggestion,
      HTMLAttributes: {
        class: "mention",
      },
    }).extend({
      addNodeView() {
        this.editor.isInitialized = true;

        return ReactNodeViewRenderer(LazyReadonlyMentionView);
      },
    }),
  ];
}

async function loadTableExtensions() {
  const [{ CustomTable }, { TableRow }, { TableCell }, { TableHeader }] =
    await Promise.all([
      import("@docmost/editor-ext/src/lib/table/table.ts"),
      import("@docmost/editor-ext/src/lib/table/row.ts"),
      import("@docmost/editor-ext/src/lib/table/cell.ts"),
      import("@docmost/editor-ext/src/lib/table/header.ts"),
    ]);

  return [
    CustomTable.configure({
      resizable: false,
      lastColumnResizable: false,
      allowTableNodeSelection: false,
    }),
    TableRow,
    TableCell,
    TableHeader,
  ];
}

async function loadMathExtensions(features: Set<string>) {
  const extensions: any[] = [];

  if (features.has("mathInline")) {
    const { MathInline } =
      await import("@docmost/editor-ext/src/lib/math/math-inline.ts");
    const LazyReadonlyMathInlineView = createLazyNodeView(
      () =>
        import("@/features/editor/components/math/readonly-math-inline-view.tsx"),
    );

    extensions.push(
      MathInline.configure({
        view: LazyReadonlyMathInlineView,
      }),
    );
  }

  if (features.has("mathBlock")) {
    const { MathBlock } =
      await import("@docmost/editor-ext/src/lib/math/math-block.ts");
    const LazyReadonlyMathBlockView = createLazyNodeView(
      () =>
        import("@/features/editor/components/math/readonly-math-block-view.tsx"),
    );

    extensions.push(
      MathBlock.configure({
        view: LazyReadonlyMathBlockView,
      }),
    );
  }

  return extensions;
}

async function loadDetailsExtensions() {
  const [{ Details }, { DetailsSummary }, { DetailsContent }] =
    await Promise.all([
      import("@docmost/editor-ext/src/lib/details/details.ts"),
      import("@docmost/editor-ext/src/lib/details/details-summary.ts"),
      import("@docmost/editor-ext/src/lib/details/details-content.ts"),
    ]);

  return [Details, DetailsSummary, DetailsContent];
}

async function loadYoutubeExtension() {
  const { Youtube } = await import("@tiptap/extension-youtube");

  return [
    Youtube.configure({
      addPasteHandler: false,
      controls: true,
      nocookie: true,
    }),
  ];
}

async function loadImageExtension() {
  const { TiptapImage } =
    await import("@docmost/editor-ext/src/lib/image/image.ts");
  const LazyImageView = createLazyNodeView(
    () => import("@/features/editor/components/image/image-view.tsx"),
  );

  return [
    TiptapImage.configure({
      view: LazyImageView,
      allowBase64: false,
    }),
  ];
}

async function loadVideoExtension() {
  const { TiptapVideo } =
    await import("@docmost/editor-ext/src/lib/video/video.ts");
  const LazyVideoView = createLazyNodeView(
    () => import("@/features/editor/components/video/video-view.tsx"),
  );

  return [
    TiptapVideo.configure({
      view: LazyVideoView,
    }),
  ];
}

async function loadAudioExtension() {
  const { TiptapAudio } =
    await import("@docmost/editor-ext/src/lib/audio/audio.ts");
  const LazyAudioView = createLazyNodeView(
    () => import("@/features/editor/components/audio/audio-view.tsx"),
  );

  return [
    TiptapAudio.configure({
      view: LazyAudioView,
    }),
  ];
}

async function loadCalloutExtension() {
  const { Callout } =
    await import("@docmost/editor-ext/src/lib/callout/callout.ts");
  const LazyCalloutView = createLazyNodeView(
    () => import("@/features/editor/components/callout/callout-view.tsx"),
  );

  return [
    Callout.configure({
      view: LazyCalloutView,
    }),
  ];
}

async function loadCodeBlockExtension() {
  const [{ CustomCodeBlock }, { lowlight }] = await Promise.all([
    import("@docmost/editor-ext/src/lib/custom-code-block/custom-code-block.ts"),
    import("@/features/editor/extensions/code-block-lowlight.ts"),
  ]);
  const LazyReadonlyCodeBlockView = createLazyNodeView(
    () =>
      import("@/features/editor/components/code-block/readonly-code-block-view.tsx"),
  );

  return [
    CustomCodeBlock.configure({
      view: LazyReadonlyCodeBlockView,
      // @ts-ignore
      lowlight,
      HTMLAttributes: {
        spellcheck: false,
      },
    }),
  ];
}

async function loadAttachmentExtension() {
  const { Attachment } =
    await import("@docmost/editor-ext/src/lib/attachment/attachment.ts");
  const LazyAttachmentView = createLazyNodeView(
    () => import("@/features/editor/components/attachment/attachment-view.tsx"),
  );

  return [
    Attachment.configure({
      view: LazyAttachmentView,
    }),
  ];
}

async function loadDrawioExtension() {
  const { Drawio } = await import("@docmost/editor-ext/src/lib/drawio.ts");
  const LazyReadonlyDrawioView = createLazyNodeView(
    () =>
      import("@/features/editor/components/drawio/readonly-drawio-view.tsx"),
  );

  return [
    Drawio.configure({
      view: LazyReadonlyDrawioView,
    }),
  ];
}

async function loadExcalidrawExtension() {
  const { Excalidraw } =
    await import("@docmost/editor-ext/src/lib/excalidraw.ts");
  const LazyReadonlyExcalidrawView = createLazyNodeView(
    () =>
      import("@/features/editor/components/excalidraw/readonly-excalidraw-view.tsx"),
  );

  return [
    Excalidraw.configure({
      view: LazyReadonlyExcalidrawView,
    }),
  ];
}

async function loadEmbedExtension() {
  const { Embed } = await import("@docmost/editor-ext/src/lib/embed.ts");
  const LazyReadonlyEmbedView = createLazyNodeView(
    () => import("@/features/editor/components/embed/readonly-embed-view.tsx"),
  );

  return [
    Embed.configure({
      view: LazyReadonlyEmbedView,
    }),
  ];
}

async function loadSubpagesExtension() {
  const { Subpages } =
    await import("@docmost/editor-ext/src/lib/subpages/subpages.ts");
  const LazySubpagesView = createLazyNodeView(
    () => import("@/features/editor/components/subpages/subpages-view.tsx"),
  );

  return [
    Subpages.configure({
      view: LazySubpagesView,
    }),
  ];
}

export async function getReadonlyExtensions(content: any) {
  const features = collectContentFeatures(content);
  const hasTableFeature =
    features.has("table") ||
    features.has("tableRow") ||
    features.has("tableCell") ||
    features.has("tableHeader");
  const shouldLoadMathInline = features.has("mathInline");
  const shouldLoadMathBlock = features.has("mathBlock") || hasTableFeature;
  const shouldLoadDetails =
    features.has("details") ||
    features.has("detailsSummary") ||
    features.has("detailsContent") ||
    hasTableFeature;
  const extensions: any[] = [
    StarterKit.configure({
      heading: false,
      undoRedo: false,
      link: false,
      trailingNode: false,
      dropcursor: false,
      codeBlock: false,
      code: {
        HTMLAttributes: {
          spellcheck: false,
        },
      },
    }),
    SharedStorage,
    Heading,
    UniqueID.configure({
      types: ["heading", "paragraph"],
      updateDocument: false,
    }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    TaskList,
    TaskItem.configure({
      nested: true,
    }),
    LinkExtension.configure({
      openOnClick: false,
    }),
    Superscript,
    SubScript,
    Highlight.configure({
      multicolor: true,
    }),
    Typography,
    TextStyle,
    Color,
  ];

  const groups: Promise<any[]>[] = [];

  if (features.has("comment")) {
    groups.push(loadCommentExtension());
  }

  if (features.has("mention")) {
    groups.push(loadMentionExtension());
  }

  if (hasTableFeature) {
    groups.push(loadTableExtensions());
  }

  if (shouldLoadMathInline || shouldLoadMathBlock) {
    groups.push(
      loadMathExtensions(
        new Set([
          ...(shouldLoadMathInline ? ["mathInline"] : []),
          ...(shouldLoadMathBlock ? ["mathBlock"] : []),
        ]),
      ),
    );
  }

  if (shouldLoadDetails) {
    groups.push(loadDetailsExtensions());
  }

  if (features.has("youtube")) {
    groups.push(loadYoutubeExtension());
  }

  if (features.has("image") || hasTableFeature) {
    groups.push(loadImageExtension());
  }

  if (features.has("video") || hasTableFeature) {
    groups.push(loadVideoExtension());
  }

  if (features.has("audio") || hasTableFeature) {
    groups.push(loadAudioExtension());
  }

  if (features.has("callout") || hasTableFeature) {
    groups.push(loadCalloutExtension());
  }

  if (features.has("codeBlock") || hasTableFeature) {
    groups.push(loadCodeBlockExtension());
  }

  if (features.has("attachment") || hasTableFeature) {
    groups.push(loadAttachmentExtension());
  }

  if (features.has("drawio")) {
    groups.push(loadDrawioExtension());
  }

  if (features.has("excalidraw")) {
    groups.push(loadExcalidrawExtension());
  }

  if (features.has("embed")) {
    groups.push(loadEmbedExtension());
  }

  if (features.has("subpages")) {
    groups.push(loadSubpagesExtension());
  }

  const loadedGroups = await Promise.all(groups);
  for (const group of loadedGroups) {
    extensions.push(...group);
  }

  return extensions;
}
