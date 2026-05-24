import { Text, MantineSize, SegmentedControl } from "@mantine/core";
import { useAtom } from "jotai";
import { updateUser } from "@/features/user/services/user-service.ts";
import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageEditMode } from "@/features/user/types/user.types.ts";
import { ResponsiveSettingsRow, ResponsiveSettingsContent, ResponsiveSettingsControl } from "@/components/ui/responsive-settings-row";
import { pageEditModePreferenceAtom } from "@/features/editor/atoms/editor-view-preference-atoms.ts";
import { userAtom } from "@/features/user/atoms/current-user-atom.ts";
import { currentPageEditModeAtom } from "@/features/editor/atoms/editor-atoms.ts";

export default function PageStatePref() {
  const { t } = useTranslation();

  return (
    <ResponsiveSettingsRow>
      <ResponsiveSettingsContent>
        <Text size="md">{t("Default page edit mode")}</Text>
        <Text size="sm" c="dimmed">
          {t("Choose your preferred page edit mode. Avoid accidental edits.")}
        </Text>
      </ResponsiveSettingsContent>

      <ResponsiveSettingsControl>
        <PageStateSegmentedControl />
      </ResponsiveSettingsControl>
    </ResponsiveSettingsRow>
  );
}

interface PageStateSegmentedControlProps {
  size?: MantineSize;
}

function normalizePageEditMode(mode?: string | null): PageEditMode | undefined {
  return mode === PageEditMode.Edit || mode === PageEditMode.Read
    ? mode
    : undefined;
}

export function PageStateSegmentedControl({
  size,
}: PageStateSegmentedControlProps) {
  const { t } = useTranslation();
  const [user, setUser] = useAtom(userAtom);
  const [localPageEditMode, setLocalPageEditMode] = useAtom(
    pageEditModePreferenceAtom,
  );
  const [isLoading, setIsLoading] = useState(false);
  const pageEditMode =
    localPageEditMode ??
    user?.settings?.preferences?.pageEditMode ??
    PageEditMode.Edit;
  const [value, setValue] = useState(pageEditMode);

  const handleChange = useCallback(
    async (nextMode: string) => {
      const normalizedValue = normalizePageEditMode(nextMode);

      if (
        isLoading ||
        !normalizedValue ||
        normalizedValue === pageEditMode ||
        normalizedValue === value
      ) {
        return;
      }

      const prevValue = value;
      const prevUser = user;
      const prevLocal = localPageEditMode;
      const fallbackFromUser =
        normalizePageEditMode(prevUser?.settings?.preferences?.pageEditMode) ??
        prevLocal ??
        PageEditMode.Edit;

      setValue(normalizedValue);
      setIsLoading(true);
      setLocalPageEditMode(normalizedValue);
      if (prevUser) {
        setUser({
          ...prevUser,
          settings: {
            ...(prevUser?.settings ?? {}),
            preferences: {
              ...(prevUser?.settings?.preferences ?? {}),
              pageEditMode: normalizedValue,
              fullPageWidth:
                prevUser?.settings?.preferences?.fullPageWidth ??
                false,
            },
          },
        });
      }

      try {
        const updatedUser = await updateUser({ pageEditMode: normalizedValue });
        setUser(updatedUser);
        setLocalPageEditMode(
          normalizePageEditMode(updatedUser.settings?.preferences?.pageEditMode) ??
            normalizedValue,
        );
      } catch (error) {
        setValue(prevValue);
        setLocalPageEditMode(fallbackFromUser);
        if (prevUser) {
          setUser(prevUser);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [
      isLoading,
      localPageEditMode,
      pageEditMode,
      setLocalPageEditMode,
      setUser,
      user,
      value,
    ],
  );

  useEffect(() => {
    if (pageEditMode !== value) {
      setValue(pageEditMode);
    }
  }, [pageEditMode, value]);

  return (
    <SegmentedControl
      size={size}
      value={value}
      disabled={isLoading}
      onChange={handleChange}
      data={[
        { label: t("Edit"), value: PageEditMode.Edit },
        { label: t("Read"), value: PageEditMode.Read },
      ]}
    />
  );
}

// Header variant: updates the current page's mode locally without persisting
// the preference to the server.
export function PageEditModeToggle({ size }: { size?: MantineSize }) {
  const { t } = useTranslation();
  const [currentPageEditMode, setCurrentPageEditMode] = useAtom(
    currentPageEditModeAtom,
  );

  return (
    <SegmentedControl
      size={size}
      value={currentPageEditMode}
      onChange={(v) => setCurrentPageEditMode(v as PageEditMode)}
      data={[
        { label: t("Edit"), value: PageEditMode.Edit },
        { label: t("Read"), value: PageEditMode.Read },
      ]}
    />
  );
}
