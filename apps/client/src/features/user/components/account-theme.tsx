import { Group, Text, useMantineColorScheme, Select } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useThemePalette } from "@/features/theme/theme-palette-provider.tsx";
import {
  getCurrentThemeOption,
  getThemeOptionByValue,
  setStoredThemeOption,
  THEME_OPTIONS,
  type ThemeOptionValue,
} from "@/features/theme/theme-options.ts";

const THEME_OPTION_LABEL_KEYS: Record<ThemeOptionValue, string> = {
  light: "Light",
  "light-soft": "ThemeLightSoft",
  dark: "Dark",
  "dark-gray": "ThemeDarkGray",
  "dark-blue": "ThemeDarkBlue",
  "dark-warm": "ThemeDarkWarm",
  "dark-green": "ThemeDarkGreen",
  auto: "System settings",
};

export default function AccountTheme() {
  const { t } = useTranslation();

  return (
    <Group justify="space-between" wrap="nowrap" gap="xl">
      <div>
        <Text size="md">{t("Theme")}</Text>
        <Text size="sm" c="dimmed">
          {t("Choose your preferred color scheme.")}
        </Text>
      </div>

      <ThemeSwitcher />
    </Group>
  );
}

function ThemeSwitcher() {
  const { t } = useTranslation();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const { palette, setPalette } = useThemePalette();
  const currentOption = getCurrentThemeOption(colorScheme, palette);

  const handleChange = (value: string | null) => {
    if (!value) return;
    const opt = getThemeOptionByValue(value as ThemeOptionValue);
    if (opt) {
      setColorScheme(opt.colorScheme);
      setPalette(opt.palette);
      setStoredThemeOption(opt.value);
    }
  };

  return (
    <Select
      label={t("Select theme")}
      data={THEME_OPTIONS.map((opt) => ({
        value: opt.value,
        label: t(THEME_OPTION_LABEL_KEYS[opt.value]),
      }))}
      value={currentOption}
      onChange={handleChange}
      allowDeselect={false}
      checkIconPosition="right"
    />
  );
}
