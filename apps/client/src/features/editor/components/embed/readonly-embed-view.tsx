import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { Card, Text } from "@mantine/core";
import { useMemo } from "react";
import clsx from "clsx";
import {
  getEmbedProviderById,
  getEmbedUrlAndProvider,
} from "@docmost/editor-ext/src/lib/embed-provider.ts";
import { sanitizeUrl } from "@docmost/editor-ext/src/lib/utils.ts";
import { useTranslation } from "react-i18next";
import classes from "./embed-view.module.css";

export default function ReadonlyEmbedView(props: NodeViewProps) {
  const { t } = useTranslation();
  const { node, selected } = props;
  const { src, provider, height: nodeHeight } = node.attrs;

  const embedUrl = useMemo(() => {
    if (!src) {
      return null;
    }

    return getEmbedUrlAndProvider(src).embedUrl;
  }, [src]);

  if (!embedUrl) {
    return (
      <NodeViewWrapper>
        <Card radius="md" p="xs" withBorder>
          <Text component="span" size="lg" c="dimmed">
            {t("Embed {{provider}}", {
              provider: getEmbedProviderById(provider)?.name,
            })}
          </Text>
        </Card>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper>
      <div
        className={clsx(classes.embedWrapper, {
          "ProseMirror-selectednode": selected,
        })}
        style={{ height: nodeHeight || 480 }}
      >
        <iframe
          className={classes.embedIframe}
          src={sanitizeUrl(embedUrl)}
          allow="encrypted-media"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          allowFullScreen
          frameBorder="0"
          loading="lazy"
        />
      </div>
    </NodeViewWrapper>
  );
}
