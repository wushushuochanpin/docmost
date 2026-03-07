import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { Card, Image, Text } from "@mantine/core";
import { getFileUrl } from "@/lib/config.ts";
import clsx from "clsx";
import { useTranslation } from "react-i18next";

export default function ReadonlyExcalidrawView(props: NodeViewProps) {
  const { t } = useTranslation();
  const { node, selected } = props;
  const { src, title, width } = node.attrs;

  if (!src) {
    return (
      <NodeViewWrapper>
        <Card radius="md" p="xs" withBorder>
          <Text component="span" size="lg" c="dimmed">
            {t("Excalidraw diagram unavailable")}
          </Text>
        </Card>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper data-drag-handle>
      <Image
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
    </NodeViewWrapper>
  );
}
