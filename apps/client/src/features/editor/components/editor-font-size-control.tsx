import { MantineSize, SegmentedControl } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { updateUser } from "@/features/user/services/user-service.ts";
import { EditorFontSize, IUser } from "@/features/user/types/user.types.ts";
import { userAtom } from "@/features/user/atoms/current-user-atom.ts";
import { editorFontSizePreferenceAtom } from "@/features/editor/atoms/editor-view-preference-atoms.ts";
import {
  extractEditorFontSizeFromUser,
  normalizeEditorFontSize,
} from "@/features/editor/utils/editor-font-size-utils";

interface EditorFontSizeSegmentedControlProps {
  size?: MantineSize;
}

export function EditorFontSizeSegmentedControl({
  size,
}: EditorFontSizeSegmentedControlProps) {
  const { t } = useTranslation();
  const [user, setUser] = useAtom(userAtom);
  const [localEditorFontSize, setLocalEditorFontSize] = useAtom(
    editorFontSizePreferenceAtom,
  );
  const editorFontSize =
    localEditorFontSize ??
    extractEditorFontSizeFromUser(user) ??
    EditorFontSize.Normal;
  const [value, setValue] = useState<EditorFontSize>(editorFontSize);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setValue(editorFontSize);
  }, [editorFontSize]);

  const handleChange = useCallback(
    async (nextValue: string) => {
      const normalizedNextValue = normalizeEditorFontSize(nextValue);
      if (isLoading || normalizedNextValue === undefined || nextValue === value) {
        return;
      }

      const prevValue = value;
      const prevUser = user;
      const nextUser =
        user && {
          ...user,
          settings: {
            ...user.settings,
            preferences: {
              ...user.settings?.preferences,
              editorFontSize: normalizedNextValue,
            },
          },
        };

      setIsLoading(true);
      setValue(normalizedNextValue);
      setLocalEditorFontSize(normalizedNextValue);
      if (nextUser) {
        setUser(nextUser);
      }

      try {
        const updatedUser = await updateUser({
          editorFontSize: normalizedNextValue,
        });
        const updatedPreference = extractEditorFontSizeFromUser(updatedUser);

        if (updatedPreference) {
          setValue(updatedPreference);
          setLocalEditorFontSize(updatedPreference);
          setUser({
            ...updatedUser,
            settings: {
              ...updatedUser?.settings,
              preferences: {
                ...(updatedUser?.settings?.preferences ?? {}),
                editorFontSize: updatedPreference,
              },
            } as IUser["settings"],
          } as IUser);
        } else {
          if (nextUser) {
            setUser(nextUser);
          }
        }
      } catch (err) {
        setValue(prevValue);
        if (prevValue) {
          setLocalEditorFontSize(prevValue);
        }
        if (prevUser) {
          setUser(prevUser);
        }
        notifications.show({
          message: t("Failed to update data"),
          color: "red",
        });
        console.log(err);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, setUser, t, user, value],
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
