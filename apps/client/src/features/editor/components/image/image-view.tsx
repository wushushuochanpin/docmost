import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { Group, Image, Loader, Text } from "@mantine/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getFileUrl } from "@/lib/config.ts";
import clsx from "clsx";
import classes from "./image-view.module.css";
import { useTranslation } from "react-i18next";

export default function ImageView(props: NodeViewProps) {
  const { t } = useTranslation();
  const { editor, node, selected } = props;
  const { src, width, align, title, aspectRatio, placeholder, attachmentId } =
    node.attrs;
  const alignClass = useMemo(() => {
    if (align === "left") return "alignLeft";
    if (align === "right") return "alignRight";
    if (align === "center") return "alignCenter";
    return "alignCenter";
  }, [align]);
  const imageSources = useMemo(() => {
    const candidates = [
      src,
      attachmentId ? `/api/files/by-id/${attachmentId}` : null,
      attachmentId ? `/api/files/${attachmentId}/image.png` : null,
    ]
      .filter(Boolean)
      .map((item) => getFileUrl(item));

    return Array.from(new Set(candidates));
  }, [src, attachmentId]);
  const [imageSourceIndex, setImageSourceIndex] = useState(0);

  useEffect(() => {
    setImageSourceIndex(0);
  }, [src, attachmentId]);

  const currentImageSrc = imageSources[imageSourceIndex];
  const hasExhaustedImageSources =
    imageSources.length > 0 && imageSourceIndex >= imageSources.length - 1;
  const [imageLoadFailed, setImageLoadFailed] = useState(false);

  useEffect(() => {
    setImageLoadFailed(false);
  }, [currentImageSrc]);

  const handleImageError = useCallback(() => {
    if (!hasExhaustedImageSources) {
      setImageSourceIndex((prev) => prev + 1);
      return;
    }

    setImageLoadFailed(true);
  }, [hasExhaustedImageSources]);

  const previewSrc = useMemo(() => {
    editor.storage.shared.imagePreviews =
      editor.storage.shared.imagePreviews || {};

    if (placeholder?.id) {
      return editor.storage.shared.imagePreviews[placeholder.id];
    }

    return null;
  }, [placeholder, editor]);

  return (
    <NodeViewWrapper data-drag-handle>
      <div
        className={clsx(
          selected && "ProseMirror-selectednode",
          classes.imageWrapper,
          alignClass,
        )}
        style={{
          aspectRatio: aspectRatio
            ? aspectRatio
            : currentImageSrc
              ? undefined
              : "16 / 9",
          width,
        }}
      >
        {currentImageSrc && !imageLoadFailed && (
          <Image
            radius="md"
            fit="contain"
            src={currentImageSrc}
            alt={title}
            onError={handleImageError}
          />
        )}
        {!currentImageSrc && previewSrc && (
          <Group pos="relative" h="100%" w="100%">
            <Image
              radius="md"
              fit="contain"
              src={previewSrc}
              alt={placeholder?.name}
            />
            <Loader size={20} pos="absolute" bottom={6} right={6} />
          </Group>
        )}
        {imageLoadFailed && (
          <Group justify="center" wrap="nowrap" gap="xs" maw="100%" px="md">
            <Text component="span" size="sm" truncate="end">
              {t("Failed to load image")}
            </Text>
          </Group>
        )}
        {!currentImageSrc && !previewSrc && !imageLoadFailed && (
          <Group justify="center" wrap="nowrap" gap="xs" maw="100%" px="md">
            <Loader size={20} style={{ flexShrink: 0 }} />
            <Text component="span" size="sm" truncate="end">
              {placeholder?.name
                ? t("Uploading {{name}}", { name: placeholder.name })
                : t("Uploading file")}
            </Text>
          </Group>
        )}
      </div>
    </NodeViewWrapper>
  );
}
