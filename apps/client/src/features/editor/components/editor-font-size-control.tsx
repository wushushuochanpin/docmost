import { MantineSize, SegmentedControl } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { updateUser } from "@/features/user/services/user-service.ts";
import { EditorFontSize } from "@/features/user/types/user.types.ts";
import { userAtom } from "@/features/user/atoms/current-user-atom.ts";

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

  useEffect(() => {
    setValue(editorFontSize);
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
    [isLoading, setUser, t, value],
  );

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
