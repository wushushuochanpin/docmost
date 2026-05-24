import React, { useEffect, useState } from "react";
import { Group, Text, ScrollArea, ActionIcon, Tooltip } from "@mantine/core";
import {
  IconUser,
  IconSettings,
  IconUsers,
  IconArrowLeft,
  IconUsersGroup,
  IconSpaces,
  IconBrush,
  IconCoin,
  IconLock,
  IconKey,
  IconWorld,
  IconSparkles,
  IconDatabaseExport,
  IconHistory,
  IconShieldCheck,
} from "@tabler/icons-react";
import { Link, useLocation } from "react-router-dom";
import classes from "./settings.module.css";
import { useTranslation } from "react-i18next";
import { isBackupEnabled, isCloud } from "@/lib/config.ts";
import useUserRole from "@/hooks/use-user-role.tsx";
import { useAtom } from "jotai";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { entitlementAtom } from "@/ee/entitlement/entitlement-atom";
import { Feature } from "@/ee/features";
import { useUpgradeLabel } from "@/ee/hooks/use-upgrade-label";
import {
  prefetchApiKeyManagement,
  prefetchApiKeys,
  prefetchAuditLogs,
  prefetchBilling,
  prefetchGroups,
  prefetchLicense,
  prefetchScimTokens,
  prefetchShares,
  prefetchSpaces,
  prefetchSsoProviders,
  prefetchVerifiedPages,
  prefetchWorkspaceMembers,
} from "@/components/settings/settings-queries.tsx";
import AppVersion from "@/components/settings/app-version.tsx";
import { mobileSidebarAtom } from "@/components/layouts/global/hooks/atoms/sidebar-atom.ts";
import { useToggleSidebar } from "@/components/layouts/global/hooks/hooks/use-toggle-sidebar.ts";
import { useSettingsNavigation } from "@/hooks/use-settings-navigation";
import type { IWorkspaceCapabilities } from "@/features/workspace/types/workspace.types.ts";

type CapabilityKey = keyof IWorkspaceCapabilities;

interface DataItem {
  label: string;
  icon: React.ElementType;
  path: string;
  isCloud?: boolean;
  isEnterprise?: boolean;
  isAdmin?: boolean;
  isOwner?: boolean;
  isSelfhosted?: boolean;
  showDisabledInNonEE?: boolean;
  capabilityKey?: CapabilityKey;
  feature?: string;
}

interface DataGroup {
  heading: string;
  items: DataItem[];
}

const groupedData: DataGroup[] = [
  {
    heading: "Account",
    items: [
      { label: "Profile", icon: IconUser, path: "/settings/account/profile" },
      {
        label: "Preferences",
        icon: IconBrush,
        path: "/settings/account/preferences",
      },
      {
        label: "API keys",
        icon: IconKey,
        path: "/settings/account/api-keys",
        isCloud: true,
        isEnterprise: true,
        showDisabledInNonEE: true,
        capabilityKey: "integrationTokens",
      },
    ],
  },
  {
    heading: "Workspace",
    items: [
      { label: "General", icon: IconSettings, path: "/settings/workspace" },
      { label: "Members", icon: IconUsers, path: "/settings/members" },
      {
        label: "Billing",
        icon: IconCoin,
        path: "/settings/billing",
        isCloud: true,
        isAdmin: true,
      },
      {
        label: "Security & SSO",
        icon: IconLock,
        path: "/settings/security",
        isCloud: true,
        isEnterprise: true,
        isAdmin: true,
        showDisabledInNonEE: true,
        capabilityKey: "securityPolicies",
      },
      { label: "Groups", icon: IconUsersGroup, path: "/settings/groups" },
      { label: "Spaces", icon: IconSpaces, path: "/settings/spaces" },
      { label: "Public sharing", icon: IconWorld, path: "/settings/sharing" },
      {
        label: "Verified pages",
        icon: IconShieldCheck,
        path: "/settings/verifications",
        feature: Feature.PAGE_VERIFICATION,
      },
      {
        label: "API management",
        icon: IconKey,
        path: "/settings/api-keys",
        isCloud: true,
        isEnterprise: true,
        isAdmin: true,
        showDisabledInNonEE: true,
        capabilityKey: "workspaceTokenManagement",
      },
      {
        label: "AI settings",
        icon: IconSparkles,
        path: "/settings/ai",
        isAdmin: true,
      },
      {
        label: "Audit log",
        icon: IconHistory,
        path: "/settings/audit",
        isEnterprise: true,
        isOwner: true,
        isSelfhosted: true,
        showDisabledInNonEE: true,
        capabilityKey: "auditLogs",
      },
    ],
  },
  {
    heading: "System",
    items: [
      {
        label: "Backup & Restore",
        icon: IconDatabaseExport,
        path: "/settings/backup",
        isSelfhosted: true,
        isAdmin: true,
      },
      {
        label: "License & Edition",
        icon: IconKey,
        path: "/settings/license",
      },
    ],
  },
];

export default function SettingsSidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const [active, setActive] = useState(location.pathname);
  const { goBack } = useSettingsNavigation();
  const { isAdmin, isOwner } = useUserRole();
  const [workspace] = useAtom(workspaceAtom);
  const [entitlements] = useAtom(entitlementAtom);
  const upgradeLabel = useUpgradeLabel();
  const [mobileSidebarOpened] = useAtom(mobileSidebarAtom);
  const toggleMobileSidebar = useToggleSidebar(mobileSidebarAtom);

  useEffect(() => {
    setActive(location.pathname);
  }, [location.pathname]);

  const hasRoleAccess = (item: DataItem) => {
    if (item.isOwner) return isOwner;
    if (item.isAdmin) return isAdmin;
    return true;
  };

  const hasCapabilityAccess = (item: DataItem) => {
    if (!item.capabilityKey) return false;
    return Boolean(workspace?.capabilities?.[item.capabilityKey]);
  };

  const hasFeature = (feature: string) =>
    entitlements?.features?.includes(feature) ?? false;

  const canShowItem = (item: DataItem) => {
    if (item.path === "/settings/backup" && !isBackupEnabled()) {
      return false;
    }

    if (item.capabilityKey && item.showDisabledInNonEE) {
      if (item.isSelfhosted && isCloud()) return false;
      return hasRoleAccess(item);
    }

    if (item.capabilityKey) {
      return hasCapabilityAccess(item) && hasRoleAccess(item);
    }

    if (item.showDisabledInNonEE && item.isEnterprise) {
      if (item.isSelfhosted && isCloud()) return false;
      return hasRoleAccess(item);
    }

    if (item.isCloud && item.isEnterprise) {
      if (!(isCloud() || workspace?.hasLicenseKey)) return false;
      return hasRoleAccess(item);
    }

    if (item.isCloud) {
      return isCloud() ? hasRoleAccess(item) : false;
    }

    if (item.isSelfhosted) {
      return !isCloud() ? hasRoleAccess(item) : false;
    }

    if (item.isEnterprise) {
      return workspace?.hasLicenseKey ? hasRoleAccess(item) : false;
    }

    return hasRoleAccess(item);
  };

  const isItemDisabled = (item: DataItem) => {
    if (item.feature) {
      return !hasFeature(item.feature);
    }

    if (item.capabilityKey && item.showDisabledInNonEE) {
      return !hasCapabilityAccess(item);
    }

    if (item.showDisabledInNonEE && item.isEnterprise) {
      return !(isCloud() || workspace?.hasLicenseKey);
    }
    return false;
  };

  const menuItems = groupedData.map((group) => {
    if (group.heading === "System" && (!isAdmin || isCloud())) {
      return null;
    }

    return (
      <div key={group.heading}>
        <Text c="dimmed" className={classes.linkHeader}>
          {t(group.heading)}
        </Text>
        {group.items.map((item) => {
          if (!canShowItem(item)) {
            return null;
          }

          let prefetchHandler: (() => void) | undefined;
          switch (item.label) {
            case "Members":
              prefetchHandler = prefetchWorkspaceMembers;
              break;
            case "Spaces":
              prefetchHandler = prefetchSpaces;
              break;
            case "Groups":
              prefetchHandler = prefetchGroups;
              break;
            case "Billing":
              prefetchHandler = prefetchBilling;
              break;
            case "License & Edition":
              if (workspace?.hasLicenseKey) {
                prefetchHandler = prefetchLicense;
              }
              break;
            case "Security & SSO":
              prefetchHandler = () => {
                prefetchSsoProviders();
                prefetchScimTokens();
              };
              break;
            case "Public sharing":
              prefetchHandler = prefetchShares;
              break;
            case "API keys":
              prefetchHandler = prefetchApiKeys;
              break;
            case "API management":
              prefetchHandler = prefetchApiKeyManagement;
              break;
            case "Audit log":
              prefetchHandler = prefetchAuditLogs;
              break;
            case "Verified pages":
              prefetchHandler = prefetchVerifiedPages;
              break;
            default:
              break;
          }

          const isDisabled = isItemDisabled(item);

          if (isDisabled) {
            return (
              <Tooltip
                key={item.label}
                label={
                  item.feature
                    ? upgradeLabel
                    : t("Available in enterprise edition")
                }
                position="right"
                withArrow
              >
                <span
                  className={classes.link}
                  data-disabled
                  role="link"
                  aria-disabled="true"
                  tabIndex={0}
                  style={{
                    opacity: 0.5,
                    cursor: "not-allowed",
                  }}
                >
                  <item.icon className={classes.linkIcon} stroke={1.75} />
                  <span>{t(item.label)}</span>
                </span>
              </Tooltip>
            );
          }

          return (
            <Link
              onMouseEnter={prefetchHandler}
              className={classes.link}
              data-active={active.startsWith(item.path) || undefined}
              key={item.label}
              to={item.path}
              onClick={() => {
                if (mobileSidebarOpened) {
                  toggleMobileSidebar();
                }
              }}
            >
              <item.icon className={classes.linkIcon} stroke={1.75} />
              <span>{t(item.label)}</span>
            </Link>
          );
        })}
      </div>
    );
  });

  return (
    <div className={classes.navbar}>
      <Group className={classes.title} justify="flex-start">
        <ActionIcon
          onClick={() => {
            goBack();
            if (mobileSidebarOpened) {
              toggleMobileSidebar();
            }
          }}
          variant="subtle"
          c="gray"
          aria-label={t("Back")}
        >
          <IconArrowLeft size={16} stroke={1.75} />
        </ActionIcon>
        <Text fw={500}>{t("Settings")}</Text>
      </Group>

      <ScrollArea w="100%">{menuItems}</ScrollArea>

      {!isCloud() && <AppVersion />}

      {isCloud() && (
        <div className={classes.text}>
          <Text
            size="sm"
            c="dimmed"
            component="a"
            href="mailto:help@docmost.com"
          >
            help@docmost.com
          </Text>
        </div>
      )}
    </div>
  );
}
