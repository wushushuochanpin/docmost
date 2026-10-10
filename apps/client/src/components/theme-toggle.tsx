import { useTranslation } from "react-i18next";
import {
  ActionIcon,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from "@mantine/core";
import { Moon, Sun } from "lucide-react";
import classes from "./theme-toggle.module.css";

export function ThemeToggle() {
  const { t } = useTranslation();
  const { setColorScheme } = useMantineColorScheme();
  const computedColorScheme = useComputedColorScheme();

  return (
    <Tooltip label={t("Toggle Color Scheme")}>
      <ActionIcon
        variant="default"
        onClick={() => {
          setColorScheme(computedColorScheme === "light" ? "dark" : "light");
        }}
        aria-label={t("Toggle color scheme")}
      >
        <Sun className={classes.light} size={18} strokeWidth={1.5} />
        <Moon className={classes.dark} size={18} strokeWidth={1.5} />
      </ActionIcon>
    </Tooltip>
  );
}
