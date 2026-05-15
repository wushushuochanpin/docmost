import {
  Text,
  Group,
  UnstyledButton,
  Badge,
  Table,
  ActionIcon,
} from "@mantine/core";
import { Link } from "react-router-dom";
import PageListSkeleton from "@/components/ui/page-list-skeleton.tsx";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import { formattedDate } from "@/lib/time.ts";
import {
  prefetchPage,
  useRecentChangesQuery,
} from "@/features/page/queries/page-query.ts";
import { IconFileDescription, IconFiles } from "@tabler/icons-react";
import { EmptyState } from "@/components/ui/empty-state.tsx";
import { getSpaceUrl } from "@/lib/config.ts";
import { useTranslation } from "react-i18next";
import { getInitialsColor } from "@/lib/get-initials-color.ts";
import type { IPage } from "@/features/page/types/page.types.ts";

interface Props {
  spaceId?: string;
}

const preloadPageRoute = () => import("@/pages/page/page");

function prefetchRecentPage(page: Pick<IPage, "slugId">) {
  void preloadPageRoute();
  void prefetchPage({ pageId: page.slugId });
}

export default function RecentChanges({ spaceId }: Props) {
  const { t } = useTranslation();
  const { data: pages, isLoading, isError } = useRecentChangesQuery(spaceId);
  const items = pages?.pages.flatMap((page) => page.items) ?? [];

  if (isLoading) {
    return <PageListSkeleton />;
  }

  if (isError) {
    return <Text>{t("Failed to fetch recent pages")}</Text>;
  }

  return items.length > 0 ? (
    <Table.ScrollContainer minWidth={500}>
      <Table highlightOnHover verticalSpacing="sm">
        <Table.Tbody>
          {items.map((page) => (
            <Table.Tr key={page.id}>
              <Table.Td>
                <UnstyledButton
                  component={Link}
                  to={buildPageUrl(page?.space.slug, page.slugId, page.title)}
                  onFocus={() => prefetchRecentPage(page)}
                  onPointerDown={() => prefetchRecentPage(page)}
                  onPointerEnter={preloadPageRoute}
                >
                  <Group wrap="nowrap">
                    {page.icon || (
                      <ActionIcon variant="transparent" color="gray" size={18}>
                        <IconFileDescription size={18} />
                      </ActionIcon>
                    )}

                    <Text fw={500} size="md" lineClamp={1}>
                      {page.title || t("Untitled")}
                    </Text>
                  </Group>
                </UnstyledButton>
              </Table.Td>
              {!spaceId && (
                <Table.Td>
                  <Badge
                    color={getInitialsColor(page?.space.name)}
                    variant="light"
                    component={Link}
                    to={getSpaceUrl(page?.space.slug)}
                    style={{ cursor: "pointer" }}
                  >
                    {page?.space.name}
                  </Badge>
                </Table.Td>
              )}
              <Table.Td>
                <Text
                  c="dimmed"
                  style={{ whiteSpace: "nowrap" }}
                  size="xs"
                  fw={500}
                >
                  {formattedDate(page.updatedAt)}
                </Text>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  ) : (
    <EmptyState
      icon={IconFiles}
      title={t("No pages yet")}
      description={t("Pages you create will show up here.")}
    />
  );
}
