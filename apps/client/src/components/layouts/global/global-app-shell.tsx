import { AppShell, Container } from "@mantine/core";
import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SettingsSidebar from "@/components/settings/settings-sidebar.tsx";
import { useAtom } from "jotai";
import {
  asideStateAtom,
  desktopSidebarAtom,
  mobileSidebarAtom,
  sidebarWidthAtom,
} from "@/components/layouts/global/hooks/atoms/sidebar-atom.ts";
import { SpaceSidebar } from "@/features/space/components/sidebar/space-sidebar.tsx";
import { AppHeader } from "@/components/layouts/global/app-header.tsx";
import Aside from "@/components/layouts/global/aside.tsx";
import classes from "./app-shell.module.css";
import { useTrialEndAction } from "@/ee/hooks/use-trial-end-action.tsx";
import { useToggleSidebar } from "@/components/layouts/global/hooks/hooks/use-toggle-sidebar.ts";
import clsx from "clsx";
import GlobalSidebar from "@/components/layouts/global/global-sidebar.tsx";
import { MAIN_CONTENT_ID, SkipToMain } from "@/components/ui/skip-to-main.tsx";
import AiChatSidebar from "@/ee/ai-chat/components/ai-chat-sidebar.tsx";

export default function GlobalAppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  useTrialEndAction();
  const [mobileOpened] = useAtom(mobileSidebarAtom);
  const toggleMobile = useToggleSidebar(mobileSidebarAtom);
  const [desktopOpened] = useAtom(desktopSidebarAtom);
  const [{ isAsideOpen, tab }, setAsideState] = useAtom(asideStateAtom);
  const [sidebarWidth, setSidebarWidth] = useAtom(sidebarWidthAtom);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef(null);
  const isTocPanelOpen = isAsideOpen && tab === "toc";
  const isCommentsPanelOpen = isAsideOpen && tab === "comments";

  const startResizing = React.useCallback((mouseDownEvent) => {
    mouseDownEvent.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = React.useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = React.useCallback(
    (mouseMoveEvent) => {
      if (isResizing) {
        const newWidth =
          mouseMoveEvent.clientX -
          sidebarRef.current.getBoundingClientRect().left;
        if (newWidth < 220) {
          setSidebarWidth(220);
          return;
        }
        if (newWidth > 600) {
          setSidebarWidth(600);
          return;
        }
        setSidebarWidth(newWidth);
      }
    },
    [isResizing],
  );

  useEffect(() => {
    //https://codesandbox.io/p/sandbox/kz9de
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResizing);
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [resize, stopResizing]);

  const location = useLocation();
  const isSettingsRoute = location.pathname.startsWith("/settings");
  const isSpaceRoute = location.pathname.startsWith("/s/");
  const isAiRoute = location.pathname.startsWith("/ai");
  const isHomeRoute = location.pathname.startsWith("/home");
  const isSpacesRoute = location.pathname === "/spaces";
  const isPageRoute = location.pathname.includes("/p/");
  const hideSidebar = isHomeRoute || isSpacesRoute;
  const showGlobalSidebar = !isSpaceRoute && !isSettingsRoute && !isAiRoute;

  const navbarVisible = !hideSidebar && (mobileOpened || desktopOpened);
  const navbarOffsetPx =
    !isPageRoute || !navbarVisible
      ? 0
      : isSpaceRoute
        ? sidebarWidth
        : 300;

  const closeTocPanel = React.useCallback(() => {
    setAsideState({ tab: "toc", isAsideOpen: false });
  }, [setAsideState]);

  const closeCommentsPanel = React.useCallback(() => {
    setAsideState({ tab: "comments", isAsideOpen: false });
  }, [setAsideState]);

  return (
    <>
      <SkipToMain />
      <AppShell
        header={{ height: 52 }}
        navbar={
          !hideSidebar && {
            width: isSpaceRoute ? sidebarWidth : 300,
            breakpoint: "sm",
            collapsed: {
              mobile: !mobileOpened,
              desktop: !desktopOpened,
            },
          }
        }
        padding={isPageRoute ? 0 : "md"}
      >
        <AppShell.Header px="md" className={classes.header} zIndex={300}>
          <AppHeader />
        </AppShell.Header>
        {!hideSidebar && (
          <AppShell.Navbar
            className={classes.navbar}
            withBorder={false}
            ref={sidebarRef}
            aria-label={
              isSpaceRoute
                ? t("Space navigation")
                : isSettingsRoute
                  ? t("Settings navigation")
                  : isAiRoute
                    ? t("AI navigation")
                    : t("Main navigation")
            }
          >
            {isSpaceRoute && (
              <div className={classes.resizeHandle} onMouseDown={startResizing} />
            )}
            {isSpaceRoute && <SpaceSidebar />}
            {isSettingsRoute && <SettingsSidebar />}
            {isAiRoute && <AiChatSidebar />}
            {showGlobalSidebar && !hideSidebar && <GlobalSidebar />}
          </AppShell.Navbar>
        )}
        <AppShell.Main id={MAIN_CONTENT_ID} tabIndex={-1}>
          {isSettingsRoute ? (
            <Container size={850}>{children}</Container>
          ) : (
            children
          )}
        </AppShell.Main>

        {isPageRoute && (
          <div
            style={
              { "--app-shell-navbar-offset": `${navbarOffsetPx}px` } as React.CSSProperties
            }
          >
            <div
              className={clsx(
                classes.pageAsidePanel,
                classes.leftPanel,
                classes.leftPanelFadeOnly,
                isTocPanelOpen && classes.openPanel,
              )}
              aria-hidden={!isTocPanelOpen}
            >
              {isTocPanelOpen && <Aside tab="toc" onClose={closeTocPanel} />}
            </div>

            <div
              className={clsx(
                classes.pageAsidePanel,
                classes.rightPanel,
                isCommentsPanelOpen && classes.openPanel,
              )}
              aria-hidden={!isCommentsPanelOpen}
            >
              {isCommentsPanelOpen && (
                <Aside tab="comments" onClose={closeCommentsPanel} />
              )}
            </div>
          </div>
        )}
      </AppShell>
    </>
  );
}
