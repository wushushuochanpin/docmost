import React from "react";
import {
  Group,
  Center,
  Text,
  ActionIcon,
  Tooltip,
  getDefaultZIndex,
} from "@mantine/core";
import { Spotlight } from "@mantine/spotlight";
import { Link } from "react-router-dom";
import {
  IconBuilding,
  IconChevronRight,
  IconDownload,
  IconFile,
  IconFileDescription,
  IconFolder,
} from "@tabler/icons-react";
import { buildPageUrl } from "@/features/page/page.utils";
import { getPageIcon } from "@/lib";
import {
  IAttachmentSearch,
  IPageSearch,
  IPageSearchPathItem,
} from "@/features/search/types/search.types";
import DOMPurify from "dompurify";
import { useTranslation } from "react-i18next";
import classes from "./search-result-item.module.css";

interface SearchResultItemProps {
  result: IPageSearch | IAttachmentSearch;
  isAttachmentResult: boolean;
  showSpace?: boolean;
}

function PageNodeIcon({ nodeType }: { nodeType?: "file" | "folder" }) {
  if (nodeType === "folder") {
    return <IconFolder size={13} stroke={1.8} />;
  }

  return <IconFileDescription size={13} stroke={1.8} />;
}

function PageResultIcon({ page }: { page: IPageSearch }) {
  if (page.icon) {
    return <>{getPageIcon(page.icon)}</>;
  }

  if (page.nodeType === "folder") {
    return <IconFolder size={18} stroke={1.75} />;
  }

  return <>{getPageIcon(page.icon)}</>;
}

function SearchResultPath({
  page,
  showSpace,
}: {
  page: IPageSearch;
  showSpace?: boolean;
}) {
  const segments: Array<
    | {
        id: string;
        title?: string | null;
        kind: "space";
      }
    | (IPageSearchPathItem & { kind: "page" })
  > = [
    ...(showSpace && page.space
      ? [
          {
            id: page.space.id || "space",
            title: page.space.name,
            kind: "space" as const,
          },
        ]
      : []),
    ...(page.path || []).map((pathItem) => ({
      ...pathItem,
      kind: "page" as const,
    })),
  ];

  if (segments.length === 0) {
    return null;
  }

  return (
    <div className={classes.pathRow}>
      {segments.map((segment, index) => (
        <React.Fragment key={`${segment.kind}-${segment.id}-${index}`}>
          {index > 0 && (
            <IconChevronRight
              size={11}
              stroke={2}
              className={classes.pathSeparator}
            />
          )}

          <span className={classes.pathSegment} title={segment.title || ""}>
            <span className={classes.pathIcon}>
              {segment.kind === "space" ? (
                <IconBuilding size={13} stroke={1.8} />
              ) : (
                <PageNodeIcon nodeType={segment.nodeType} />
              )}
            </span>
            <span className={classes.pathLabel}>{segment.title}</span>
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

export function SearchResultItem({
  result,
  isAttachmentResult,
  showSpace,
}: SearchResultItemProps) {
  const { t } = useTranslation();

  if (isAttachmentResult) {
    const attachmentResult = result as IAttachmentSearch;

    const handleDownload = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const downloadUrl = `/api/files/${attachmentResult.id}/${attachmentResult.fileName}`;
      window.open(downloadUrl, "_blank");
    };

    return (
      <Spotlight.Action
        component={Link}
        //@ts-ignore
        to={buildPageUrl(
          attachmentResult.space.slug,
          attachmentResult.page.slugId,
          attachmentResult.page.title,
        )}
        style={{ userSelect: "none" }}
      >
        <Group wrap="nowrap" w="100%">
          <Center>
            <IconFile size={16} />
          </Center>

          <div className={classes.resultContent}>
            <Text className={classes.titleText} truncate="end">
              {attachmentResult.fileName}
            </Text>
            <Text size="xs" opacity={0.6}>
              {attachmentResult.space.name} • {attachmentResult.page.title}
            </Text>

            {attachmentResult?.highlight && (
              <Text
                className={classes.highlight}
                opacity={0.6}
                size="xs"
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(attachmentResult.highlight, {
                    ALLOWED_TAGS: ["mark", "em", "strong", "b"],
                    ALLOWED_ATTR: [],
                  }),
                }}
              />
            )}
          </div>

          <Tooltip
            label={t("Download attachment")}
            zIndex={getDefaultZIndex("max")}
            withArrow
          >
            <ActionIcon variant="subtle" color="gray" onClick={handleDownload}>
              <IconDownload size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Spotlight.Action>
    );
  } else {
    const pageResult = result as IPageSearch;
    return (
      <Spotlight.Action
        component={Link}
        //@ts-ignore
        to={buildPageUrl(
          pageResult.space.slug,
          pageResult.slugId,
          pageResult.title,
        )}
        style={{ userSelect: "none" }}
      >
        <Group wrap="nowrap" w="100%">
          <Center>
            <PageResultIcon page={pageResult} />
          </Center>

          <div className={classes.resultContent}>
            <Text className={classes.titleText} truncate="end">
              {pageResult.title}
            </Text>

            <SearchResultPath page={pageResult} showSpace={showSpace} />

            {pageResult?.highlight && (
              <Text
                className={classes.highlight}
                opacity={0.6}
                size="xs"
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(pageResult.highlight, {
                    ALLOWED_TAGS: ["mark", "em", "strong", "b"],
                    ALLOWED_ATTR: [],
                  }),
                }}
              />
            )}
          </div>
        </Group>
      </Spotlight.Action>
    );
  }
}
