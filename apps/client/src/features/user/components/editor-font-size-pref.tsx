import { MantineSize, SegmentedControl, Text } from "@mantine/core";
import { useAtom } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { userAtom } from "@/features/user/atoms/current-user-atom.ts";
import { EditorFontSize } from "@/features/user/types/user.types.ts";
import { updateUser } from "@/features/user/services/user-service.ts";
import { notifications } from "@mantine/notifications";
import {
  ResponsiveSettingsRow,
  ResponsiveSettingsContent,
  ResponsiveSettingsControl,
} from "@/components/ui/responsive-settings-row";

export default function EditorFontSizePref() {
  const { t } = useTranslation();

  return (
    <ResponsiveSettingsRow>
      <ResponsiveSettingsContent>
        <Text size="md">{t("Document font size")}</Text>
        <Text size="sm" c="dimmed">
          {t("Choose a comfortable reading and editing font size for documents.")}
        </Text>
      </ResponsiveSettingsContent>

      <ResponsiveSettingsControl>
        <EditorFontSizeSegmentedControl />
      </ResponsiveSettingsControl>
    </ResponsiveSettingsRow>
  );
}

interface EditorFontSizeSegmentedControlProps {
  size?: MantineSize;
}

export function EditorFontSizeSegmentedControl({
  size,
}: EditorFontSizeSegmentedControlProps) {
  const { t } = useTranslation();
  const [user, setUser] = useAtom(userAtom);
  const editorFontSize =
    user?.settings?.preferences?.editorFontSize ?? EditorFontSize.Normal;
  const [value, setValue] = useState<EditorFontSize>(editorFontSize);
  const [isLoading, setIsLoading] = useState(false);

  const safeValue = useMemo<EditorFontSize>(() => {
    return (
      [
        EditorFontSize.Small,
        EditorFontSize.Normal,
        EditorFontSize.Large,
      ] as const
    ).includes(editorFontSize as EditorFontSize)
      ? (editorFontSize as EditorFontSize)
      : EditorFontSize.Normal;
  }, [editorFontSize]);

  const handleChange = useCallback(
    async (nextValue: string) => {
      if (
        isLoading ||
        nextValue === value ||
        ![
          EditorFontSize.Small,
          EditorFontSize.Normal,
          EditorFontSize.Large,
        ].includes(nextValue as EditorFontSize)
      ) {
        return;
      }

      const prevValue = value;
      setIsLoading(true);
      setValue(nextValue as EditorFontSize);

      try {
        const updatedUser = await updateUser({ editorFontSize: nextValue });
        const updatedPreference =
          updatedUser?.settings?.preferences?.editorFontSize;
        setUser(updatedUser);

        if (
          [
            EditorFontSize.Small,
            EditorFontSize.Normal,
            EditorFontSize.Large,
          ].includes(updatedPreference as EditorFontSize)
        ) {
          setValue(updatedPreference as EditorFontSize);
        } else {
          setValue(safeValue);
        }
      } catch (err) {
        setValue(prevValue);
        notifications.show({
          message: t("Failed to update data"),
          color: "red",
        });
        console.log(err);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, safeValue, setUser, t, value],
  );

  useEffect(() => {
    if (safeValue !== value) {
      setValue(safeValue);
    }
  }, [safeValue, value]);

  return (
    <SegmentedControl
      size={size}
      value={value}
      onChange={handleChange}
      disabled={isLoading}
      data={[
        { label: t("Small"), value: EditorFontSize.Small },
        { label: t("Normal"), value: EditorFontSize.Normal },
        { label: t("Large"), value: EditorFontSize.Large },
      ]}
    />
  );
}
