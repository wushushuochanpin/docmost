import { Container, Space } from "@mantine/core";
import HomeTabs from "@/features/home/components/home-tabs";
import HomeAiPrompt from "@/features/home/components/home-ai-prompt";
import { getAppName } from "@/lib/config.ts";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { useAtom } from "jotai";
import { useGetSpacesQuery } from "@/features/space/queries/space-query.ts";
import { recentSpaceSlugAtom } from "@/features/space/atoms/recent-space-atom";

export default function Home() {
  const { t } = useTranslation();
  const [recentSpaceSlug] = useAtom(recentSpaceSlugAtom);
  const { data: spaces } = useGetSpacesQuery({ limit: 50 });

  const currentSpace = spaces?.items?.find((s) => s.slug === recentSpaceSlug) ?? spaces?.items?.[0];
  const spaceId = currentSpace?.id;

  return (
    <>
      <Helmet>
        <title>
          {t("Home")} - {getAppName()}
        </title>
      </Helmet>
      <Container size={"900"} pt="xl">
        <HomeAiPrompt />

        <Space h="xl" />

        <HomeTabs spaceId={spaceId} />
      </Container>
    </>
  );
}
