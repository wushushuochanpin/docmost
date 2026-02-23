import { Badge, Group, Text, Tooltip, UnstyledButton } from "@mantine/core";
import classes from "./app-header.module.css";
import React from "react";
import TopMenu from "@/components/layouts/global/top-menu.tsx";
import { Link, useLocation, useParams } from "react-router-dom";
import APP_ROUTE from "@/lib/app-route.ts";
import { useAtom } from "jotai";
import {
  desktopSidebarAtom,
  mobileSidebarAtom,
} from "@/components/layouts/global/hooks/atoms/sidebar-atom.ts";
import { useToggleSidebar } from "@/components/layouts/global/hooks/hooks/use-toggle-sidebar.ts";
import SidebarToggle from "@/components/ui/sidebar-toggle-button.tsx";
import { useTranslation } from "react-i18next";
import useTrial from "@/ee/hooks/use-trial.tsx";
import { getSpaceUrl, isCloud } from "@/lib/config.ts";
import { useDisclosure } from "@mantine/hooks";
import {
  SearchControl,
  SearchMobileControl,
} from "@/features/search/components/search-control.tsx";
import { searchSpotlight } from "@/features/search/constants.ts";
import SpaceSettingsModal from "@/features/space/components/settings-modal.tsx";

const links = [{ link: APP_ROUTE.HOME, label: "Home" }];

export function AppHeader() {
  const { t } = useTranslation();
  const [mobileOpened] = useAtom(mobileSidebarAtom);
  const toggleMobile = useToggleSidebar(mobileSidebarAtom);

  const [desktopOpened] = useAtom(desktopSidebarAtom);
  const toggleDesktop = useToggleSidebar(desktopSidebarAtom);
  const { isTrial, trialDaysLeft } = useTrial();
  const location = useLocation();
  const { spaceSlug } = useParams();
  const [opened, { open: openSpaceSettings, close: closeSpaceSettings }] =
    useDisclosure(false);

  const isHomeRoute = location.pathname.startsWith("/home");
  const isSpacesRoute = location.pathname === "/spaces";
  const hideSidebar = isHomeRoute || isSpacesRoute;
  const isSpaceRoute = location.pathname.startsWith("/s/");

  const items = links.map((link) => (
    <Link key={link.label} to={link.link} className={classes.link}>
      {t(link.label)}
    </Link>
  ));

  if (isSpaceRoute && spaceSlug) {
    items.push(
      <Link
        key="overview"
        to={getSpaceUrl(spaceSlug)}
        className={classes.link}
      >
        {t("Overview")}
      </Link>,
      <UnstyledButton
        key="space-settings"
        className={classes.link}
        onClick={openSpaceSettings}
      >
        {t("Space settings")}
      </UnstyledButton>,
    );
  }

  return (
    <>
      <Group h="100%" px="md" justify="space-between" wrap={"nowrap"}>
        <Group wrap="nowrap">
          {!hideSidebar && (
            <>
              <Tooltip label={t("Sidebar toggle")}>
                <SidebarToggle
                  aria-label={t("Sidebar toggle")}
                  opened={mobileOpened}
                  onClick={toggleMobile}
                  hiddenFrom="sm"
                  size="sm"
                />
              </Tooltip>

              <Tooltip label={t("Sidebar toggle")}>
                <SidebarToggle
                  aria-label={t("Sidebar toggle")}
                  opened={desktopOpened}
                  onClick={toggleDesktop}
                  visibleFrom="sm"
                  size="sm"
                />
              </Tooltip>
            </>
          )}

          <Text
            size="md"
            fw={600}
            style={{
              cursor: "pointer",
              userSelect: "none",
              color: "var(--ui-text-primary)",
              letterSpacing: "0.01em",
            }}
            component={Link}
            to="/home"
          >
            Docmost
          </Text>

          <Group ml={50} gap={5} className={classes.links} visibleFrom="sm">
            {items}
          </Group>
        </Group>

        <Group px="md" wrap="nowrap">
          {isCloud() && isTrial && trialDaysLeft !== 0 && (
            <Badge
              variant="light"
              style={{ cursor: "pointer" }}
              component={Link}
              to={APP_ROUTE.SETTINGS.WORKSPACE.BILLING}
              visibleFrom="xs"
            >
              {trialDaysLeft === 1
              ? "1 day left"
              : `${trialDaysLeft} days left`}
            </Badge>
          )}
          <Group visibleFrom="sm">
            <SearchControl onClick={searchSpotlight.open} />
          </Group>
          <Group hiddenFrom="sm">
            <SearchMobileControl onSearch={searchSpotlight.open} />
          </Group>
          <TopMenu />
        </Group>
      </Group>

      <SpaceSettingsModal
        opened={opened}
        onClose={closeSpaceSettings}
        spaceId={spaceSlug ?? ""}
      />
    </>
  );
}
