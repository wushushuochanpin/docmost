import "@mantine/spotlight/styles.css";
import { Group, Center, Text } from "@mantine/core";
import { createSpotlight, Spotlight } from "@mantine/spotlight";
import { IconSearch } from "@tabler/icons-react";
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useDebouncedValue } from "@mantine/hooks";
import { buildSharedPageUrl } from "@/features/page/page.utils.ts";
import { getPageIcon } from "@/lib";
import { useTranslation } from "react-i18next";
import DOMPurify from "dompurify";
import { searchShare } from "@/features/search/services/search-service.ts";
import { useShareAsyncResource } from "@/features/share/hooks/use-share-async-resource.ts";

interface ShareSearchSpotlightProps {
  shareId?: string;
  accessToken?: string;
  openToken?: number;
}

const [shareSearchSpotlightStore, shareSearchSpotlight] = createSpotlight();

export function ShareSearchSpotlight({
  shareId,
  accessToken,
  openToken = 0,
}: ShareSearchSpotlightProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [debouncedSearchQuery] = useDebouncedValue(query, 300);

  useEffect(() => {
    if (openToken <= 0) {
      return;
    }

    shareSearchSpotlight.open();
  }, [openToken]);

  const { data: searchResults } = useShareAsyncResource(
    debouncedSearchQuery
      ? () =>
          searchShare({
            query: debouncedSearchQuery,
            shareId,
            accessToken,
          })
      : null,
    [debouncedSearchQuery, shareId, accessToken],
    { enabled: Boolean(debouncedSearchQuery) },
  );

  const pages = (
    searchResults && searchResults.length > 0 ? searchResults : []
  ).map((page) => (
    <Spotlight.Action
      key={page.id}
      component={Link}
      //@ts-ignore
      to={buildSharedPageUrl({
        shareId: shareId,
        pageTitle: page.title,
        pageSlugId: page.slugId,
      })}
      style={{ userSelect: "none" }}
    >
      <Group wrap="nowrap" w="100%">
        <Center>{getPageIcon(page?.icon)}</Center>

        <div style={{ flex: 1 }}>
          <Text>{page.title}</Text>

          {page?.highlight && (
            <Text
              opacity={0.6}
              size="xs"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(page.highlight, {
                  ALLOWED_TAGS: ["mark", "em", "strong", "b"],
                  ALLOWED_ATTR: []
                }),
              }}
            />
          )}
        </div>
      </Group>
    </Spotlight.Action>
  ));

  return (
    <>
      <Spotlight.Root
        store={shareSearchSpotlightStore}
        query={query}
        onQueryChange={setQuery}
        scrollable
        overlayProps={{
          backgroundOpacity: 0.55,
        }}
      >
        <Spotlight.Search
          placeholder={t("Search...")}
          leftSection={<IconSearch size={20} stroke={1.5} />}
        />
        <Spotlight.ActionsList>
          {query.length === 0 && pages.length === 0 && (
            <Spotlight.Empty>{t("Start typing to search...")}</Spotlight.Empty>
          )}

          {query.length > 0 && pages.length === 0 && (
            <Spotlight.Empty>{t("No results found...")}</Spotlight.Empty>
          )}

          {pages.length > 0 && pages}
        </Spotlight.ActionsList>
      </Spotlight.Root>
    </>
  );
}
