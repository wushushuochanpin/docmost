import { ActionIcon, Button, Tooltip } from "@mantine/core";
import {
  IconCategory2,
  IconPinned,
  IconSettings2,
  IconStack2,
} from "@tabler/icons-react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { ISidebarCategory } from "@/features/space/types/sidebar-category.types.ts";
import { SidebarViewMode } from "@/features/page/types/page.types.ts";
import classes from "./sidebar-view-tabs.module.css";

export type SidebarViewSelection = {
  key: string;
  label: string;
  viewMode: SidebarViewMode;
  categoryId: string | null;
};

interface SidebarViewTabsProps {
  categories: ISidebarCategory[];
  value: string;
  canManageCategories?: boolean;
  onChange: (value: SidebarViewSelection) => void;
  onManageCategories?: () => void;
}

export function SidebarViewTabs({
  categories,
  value,
  canManageCategories,
  onChange,
  onManageCategories,
}: SidebarViewTabsProps) {
  const { t } = useTranslation();
  const isAllActive = value === "all";
  const isPinnedActive = value === "pinned";

  return (
    <div className={classes.container}>
      <div className={classes.scrollArea}>
        <div className={classes.tabsRow}>
          <Button
            size="xs"
            variant={isAllActive ? "light" : "subtle"}
            color={isAllActive ? "blue" : "gray"}
            leftSection={<IconStack2 size={14} stroke={1.8} />}
            className={clsx(classes.tabButton, {
              [classes.tabButtonActive]: isAllActive,
            })}
            aria-pressed={isAllActive}
            onClick={() =>
              onChange({
                key: "all",
                label: t("All"),
                viewMode: "all",
                categoryId: null,
              })
            }
          >
            {t("All")}
          </Button>

          <Button
            size="xs"
            variant={isPinnedActive ? "light" : "subtle"}
            color={isPinnedActive ? "blue" : "gray"}
            leftSection={<IconPinned size={14} stroke={1.8} />}
            className={clsx(classes.tabButton, {
              [classes.tabButtonActive]: isPinnedActive,
            })}
            aria-pressed={isPinnedActive}
            onClick={() =>
              onChange({
                key: "pinned",
                label: t("Pinned"),
                viewMode: "pinned",
                categoryId: null,
              })
            }
          >
            {t("Pinned")}
          </Button>

          {categories.map((category) => {
            const tabKey = `category:${category.id}`;
            const isActive = value === tabKey;

            return (
              <Button
                key={category.id}
                size="xs"
                variant={isActive ? "light" : "subtle"}
                color={isActive ? "blue" : "gray"}
                leftSection={<IconCategory2 size={14} stroke={1.8} />}
                className={clsx(classes.tabButton, {
                  [classes.tabButtonActive]: isActive,
                })}
                aria-pressed={isActive}
                onClick={() =>
                  onChange({
                    key: tabKey,
                    label: category.name,
                    viewMode: "category",
                    categoryId: category.id,
                  })
                }
              >
                {category.name}
              </Button>
            );
          })}
        </div>
      </div>

      {canManageCategories && onManageCategories ? (
        <Tooltip label={t("Manage categories")} withArrow position="bottom">
          <ActionIcon
            variant="subtle"
            size={28}
            onClick={onManageCategories}
            aria-label={t("Manage categories")}
          >
            <IconSettings2 size={16} stroke={1.8} />
          </ActionIcon>
        </Tooltip>
      ) : null}
    </div>
  );
}
