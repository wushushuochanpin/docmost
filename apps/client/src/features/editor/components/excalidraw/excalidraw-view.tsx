import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import {
  ActionIcon,
  Card,
  Image,
  Text,
} from "@mantine/core";
import { useState } from "react";
import { getFileUrl } from "@/lib/config.ts";
import clsx from "clsx";
import { IconEdit } from "@tabler/icons-react";
import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";

const LazyExcalidrawEditorModal = lazy(
  () =>
    import(
      "@/features/editor/components/excalidraw/excalidraw-editor-modal.tsx"
    ),
);

export default function ExcalidrawView(props: NodeViewProps) {
  const { t } = useTranslation();
  const { node, updateAttributes, editor, selected } = props;
  const { src, title, width, attachmentId } = node.attrs;
  const [opened, setOpened] = useState(false);
  const pageId = (editor.storage as unknown as { pageId?: string } | undefined)
    ?.pageId;

  const handleOpen = () => {
    if (!editor.isEditable) {
      return;
    }

    setOpened(true);
  };

  return (
    <NodeViewWrapper data-drag-handle>
      {opened && (
        <Suspense fallback={null}>
          <LazyExcalidrawEditorModal
            attachmentId={attachmentId}
            onClose={() => setOpened(false)}
            onSaveSuccess={(attachment) => {
              updateAttributes({
                src: `/api/files/${attachment.id}/${attachment.fileName}?t=${new Date(attachment.updatedAt).getTime()}`,
                title: attachment.fileName,
                size: attachment.fileSize,
                attachmentId: attachment.id,
              });
            }}
            opened={opened}
            pageId={pageId}
            src={src}
          />
        </Suspense>
      )}

      {src ? (
        <div style={{ position: "relative" }}>
          <Image
            onClick={(e) => e.detail === 2 && handleOpen()}
            radius="md"
            fit="contain"
            w={width}
            src={getFileUrl(src)}
            alt={title}
            className={clsx(
              selected ? "ProseMirror-selectednode" : "",
              "alignCenter",
            )}
          />

          {selected && editor.isEditable && (
            <ActionIcon
              onClick={handleOpen}
              variant="default"
              color="gray"
              mx="xs"
              className="print-hide"
              style={{
                position: "absolute",
                top: 8,
                right: 8,
              }}
            >
              <IconEdit size={18} />
            </ActionIcon>
          )}
        </div>
      ) : (
        <Card
          radius="md"
          onClick={(e) => e.detail === 2 && handleOpen()}
          p="xs"
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
          withBorder
          className={clsx(selected ? "ProseMirror-selectednode" : "")}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            <ActionIcon variant="transparent" color="gray">
              <IconEdit size={18} />
            </ActionIcon>

            <Text component="span" size="lg" c="dimmed">
              {t("Double-click to edit Excalidraw diagram")}
            </Text>
          </div>
        </Card>
      )}
    </NodeViewWrapper>
  );
}
