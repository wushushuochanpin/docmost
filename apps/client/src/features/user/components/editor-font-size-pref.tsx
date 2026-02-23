import { MantineSize, SegmentedControl, Text } from "@mantine/core";
import { useAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { userAtom } from "@/features/user/atoms/current-user-atom.ts";
import { EditorFontSize } from "@/features/user/types/user.types.ts";
import { updateUser } from "@/features/user/services/user-service.ts";
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
  const [value, setValue] = useState(editorFontSize);

  const handleChange = useCallback(
    async (value: string) => {
      const updatedUser = await updateUser({ editorFontSize: value });
      setValue(value);
      setUser(updatedUser);
    },
    [setUser],
  );

  useEffect(() => {
    if (editorFontSize !== value) {
      setValue(editorFontSize);
    }
  }, [editorFontSize, value]);

  return (
    <SegmentedControl
      size={size}
      value={value}
      onChange={handleChange}
      data={[
        { label: t("Small"), value: EditorFontSize.Small },
        { label: t("Normal"), value: EditorFontSize.Normal },
        { label: t("Large"), value: EditorFontSize.Large },
      ]}
    />
  );
}
