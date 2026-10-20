import React from "react";
import { Group, Text, ScrollArea, ActionIcon, Tooltip } from "@mantine/core";
import {
  User,
  Settings,
  Users,
  ArrowLeft,
  UsersRound,
  Boxes,
  Brush,
  Coins,
  Lock,
  Key,
  Globe,
  Sparkles,
  Database,
  History,
  ShieldCheck,
} from "lucide-react";
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
import {
  preloadSettingsRoute,
  settingsRouteLoaders,
  type SettingsRouteLoader,
} from "@/components/settings/settings-route-loaders.ts";

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
  loader?: SettingsRouteLoader;
  prefetchData?: () => void;
}

interface DataGroup {
  heading: string;
  items: DataItem[];
}

const groupedData: DataGroup[] = [
  {
    heading: "Account",
    items: [
      {
        label: "我的 Agent 连接",
        icon: Key,
        path: "/settings/account/agent-connections",
        loader: settingsRouteLoaders.agentConnections,
      },
      {
        label: "Profile",
        icon: User,
        path: "/settings/account/profile",
        loader: settingsRouteLoaders.accountProfile,
      },
      {
        label: "Preferences",
        icon: Brush,
        path: "/settings/account/preferences",
        loader: settingsRouteLoaders.accountPreferences,
      },
      {
        label: "API keys",
        icon: Key,
        path: "/settings/account/api-keys",
        isCloud: true,
        isEnterprise: true,
        showDisabledInNonEE: true,
        capabilityKey: "integrationTokens",
        loader: settingsRouteLoaders.accountApiKeys,
        prefetchData: prefetchApiKeys,
      },
    ],
  },
  {
    heading: "Workspace",
    items: [
      {
        label: "Agent 策略",
        icon: ShieldCheck,
        path: "/settings/agent-policy",
        isAdmin: true,
        loader: settingsRouteLoaders.agentPolicy,
      },
      {
        label: "Agent 审计",
        icon: History,
        path: "/settings/agent-audit",
        isAdmin: true,
        loader: settingsRouteLoaders.agentActivity,
      },
      {
        label: "General",
        icon: Settings,
        path: "/settings/workspace",
        loader: settingsRouteLoaders.workspace,
      },
      {
        label: "Members",
        icon: Users,
        path: "/settings/members",
        loader: settingsRouteLoaders.members,
        prefetchData: prefetchWorkspaceMembers,
      },
      {
        label: "Billing",
        icon: Coins,
        path: "/settings/billing",
        isCloud: true,
        isAdmin: true,
        loader: settingsRouteLoaders.billing,
        prefetchData: prefetchBilling,
      },
      {
        label: "Security & SSO",
        icon: Lock,
        path: "/settings/security",
        isCloud: true,
        isEnterprise: true,
        isAdmin: true,
        showDisabledInNonEE: true,
        capabilityKey: "securityPolicies",
        loader: settingsRouteLoaders.security,
        prefetchData: () => {
          prefetchSsoProviders();
          prefetchScimTokens();
        },
      },
      {
        label: "Groups",
        icon: UsersRound,
        path: "/settings/groups",
        loader: settingsRouteLoaders.groups,
        prefetchData: prefetchGroups,
      },
      {
        label: "Spaces",
        icon: Boxes,
        path: "/settings/spaces",
        loader: settingsRouteLoaders.spaces,
        prefetchData: prefetchSpaces,
      },
      {
        label: "Public sharing",
        icon: Globe,
        path: "/settings/sharing",
        loader: settingsRouteLoaders.sharing,
        prefetchData: prefetchShares,
      },
      {
        label: "Verified pages",
        icon: ShieldCheck,
        path: "/settings/verifications",
        feature: Feature.PAGE_VERIFICATION,
        loader: settingsRouteLoaders.verifications,
        prefetchData: prefetchVerifiedPages,
      },
      {
        label: "API management",
        icon: Key,
        path: "/settings/api-keys",
        isCloud: true,
        isEnterprise: true,
        isAdmin: true,
        showDisabledInNonEE: true,
        capabilityKey: "workspaceTokenManagement",
        loader: settingsRouteLoaders.workspaceApiKeys,
        prefetchData: prefetchApiKeyManagement,
      },
      {
        label: "AI settings",
        icon: Sparkles,
        path: "/settings/ai",
        isAdmin: true,
        loader: settingsRouteLoaders.ai,
      },
      {
        label: "Audit log",
        icon: History,
        path: "/settings/audit",
        isEnterprise: true,
        isOwner: true,
        isSelfhosted: true,
        showDisabledInNonEE: true,
        capabilityKey: "auditLogs",
        loader: settingsRouteLoaders.audit,
        prefetchData: prefetchAuditLogs,
      },
    ],
  },
  {
    heading: "System",
    items: [
      {
        label: "Backup & Restore",
        icon: Database,
        path: "/settings/backup",
        isSelfhosted: true,
        isAdmin: true,
        loader: settingsRouteLoaders.backup,
      },
      {
        label: "License & Edition",
        icon: Key,
        path: "/settings/license",
        loader: settingsRouteLoaders.license,
        prefetchData: prefetchLicense,
      },
    ],
  },
];

export default function SettingsSidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const active = location.pathname;
  const { goBack } = useSettingsNavigation();
  const { isAdmin, isOwner } = useUserRole();
  const [workspace] = useAtom(workspaceAtom);
  const [entitlements] = useAtom(entitlementAtom);
  const upgradeLabel = useUpgradeLabel();
  const [mobileSidebarOpened] = useAtom(mobileSidebarAtom);
  const toggleMobileSidebar = useToggleSidebar(mobileSidebarAtom);

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

          const prefetchHandler = () => {
            preloadSettingsRoute(item.loader);
            if (
              item.label !== "License & Edition" ||
              workspace?.hasLicenseKey
            ) {
              item.prefetchData?.();
            }
          };

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
                  <item.icon className={classes.linkIcon} strokeWidth={1.75} />
                  <span>{t(item.label)}</span>
                </span>
              </Tooltip>
            );
          }

          return (
            <Link
              onPointerEnter={prefetchHandler}
              onFocus={prefetchHandler}
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
              <item.icon className={classes.linkIcon} strokeWidth={1.75} />
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
          <ArrowLeft size={16} strokeWidth={1.75} />
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
