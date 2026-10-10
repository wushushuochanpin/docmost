import {
  Group,
  Menu,
  Text,
  UnstyledButton,
  useMantineColorScheme,
} from "@mantine/core";
import { Sun, Brush, Check, ChevronDown, Monitor, LogOut, Moon, Settings, UserCircle, Users } from "lucide-react";
import { useAtom } from "jotai";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom.ts";
import { Link } from "react-router-dom";
import APP_ROUTE from "@/lib/app-route.ts";
import useAuth from "@/features/auth/hooks/use-auth.ts";
import { CustomAvatar } from "@/components/ui/custom-avatar.tsx";
import { useTranslation } from "react-i18next";
import { AvatarIconType } from "@/features/attachments/types/attachment.types.ts";
import { useThemePalette } from "@/features/theme/theme-palette-provider.tsx";
import {
  getCurrentThemeOption,
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

export default function TopMenu() {
  const { t } = useTranslation();
  const [currentUser] = useAtom(currentUserAtom);
  const { logout } = useAuth();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const { palette, setPalette } = useThemePalette();
  const currentOption = getCurrentThemeOption(colorScheme, palette);

  const user = currentUser?.user;
  const workspace = currentUser?.workspace;

  if (!user || !workspace) {
    return <></>;
  }

  const iconSize = 16;
  const iconStroke = 1.75;

  return (
    <Menu width={250} position="bottom-end" withArrow shadow="sm">
      <Menu.Target>
        <UnstyledButton>
          <Group gap={7} wrap={"nowrap"}>
            <CustomAvatar
              avatarUrl={workspace?.logo}
              name={workspace?.name}
              variant="light"
              size="sm"
              type={AvatarIconType.WORKSPACE_ICON}
            />
            <Text fw={500} size="sm" lh={1} mr={3} lineClamp={1}>
              {workspace?.name}
            </Text>
            <ChevronDown size={iconSize} strokeWidth={iconStroke} />
          </Group>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{t("Workspace")}</Menu.Label>

        <Menu.Item
          component={Link}
          to={APP_ROUTE.SETTINGS.WORKSPACE.GENERAL}
          leftSection={<Settings size={iconSize} strokeWidth={iconStroke} />}
        >
          {t("Workspace settings")}
        </Menu.Item>

        <Menu.Item
          component={Link}
          to={APP_ROUTE.SETTINGS.WORKSPACE.MEMBERS}
          leftSection={<Users size={iconSize} strokeWidth={iconStroke} />}
        >
          {t("Manage members")}
        </Menu.Item>

        <Menu.Divider />

        <Menu.Label>{t("Account")}</Menu.Label>
        <Menu.Item component={Link} to={APP_ROUTE.SETTINGS.ACCOUNT.PROFILE}>
          <Group wrap={"nowrap"}>
            <CustomAvatar
              size={"sm"}
              avatarUrl={user.avatarUrl}
              name={user.name}
            />

            <div style={{ width: 190 }}>
              <Text size="sm" fw={500} lineClamp={1}>
                {user.name}
              </Text>
              <Text size="xs" c="dimmed" truncate="end">
                {user.email}
              </Text>
            </div>
          </Group>
        </Menu.Item>
        <Menu.Item
          component={Link}
          to={APP_ROUTE.SETTINGS.ACCOUNT.PROFILE}
          leftSection={<UserCircle size={iconSize} strokeWidth={iconStroke} />}
        >
          {t("My profile")}
        </Menu.Item>

        <Menu.Item
          component={Link}
          to={APP_ROUTE.SETTINGS.ACCOUNT.PREFERENCES}
          leftSection={<Brush size={iconSize} strokeWidth={iconStroke} />}
        >
          {t("My preferences")}
        </Menu.Item>

        <Menu.Sub>
          <Menu.Sub.Target>
            <Menu.Sub.Item
              leftSection={
                <Sun size={iconSize} strokeWidth={iconStroke} />
              }
            >
              {t("Theme")}
            </Menu.Sub.Item>
          </Menu.Sub.Target>

          <Menu.Sub.Dropdown>
            {THEME_OPTIONS.map((opt) => {
              const isSelected = currentOption === opt.value;
              const Icon =
                opt.value === "auto"
                  ? Monitor
                  : opt.colorScheme === "dark"
                    ? Moon
                    : Sun;
              return (
                <Menu.Item
                  key={opt.value}
                  onClick={() => {
                    setColorScheme(opt.colorScheme);
                    setPalette(opt.palette);
                    setStoredThemeOption(opt.value);
                  }}
                  leftSection={<Icon size={iconSize} strokeWidth={iconStroke} />}
                  rightSection={
                    isSelected ? (
                      <Check size={iconSize} strokeWidth={iconStroke} />
                    ) : null
                  }
                >
                  {t(THEME_OPTION_LABEL_KEYS[opt.value])}
                </Menu.Item>
              );
            })}
          </Menu.Sub.Dropdown>
        </Menu.Sub>

        <Menu.Divider />

        <Menu.Item
          onClick={logout}
          leftSection={<LogOut size={iconSize} strokeWidth={iconStroke} />}
        >
          {t("Logout")}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
