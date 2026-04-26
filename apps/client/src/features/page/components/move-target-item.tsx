import {
  Badge,
  Box,
  Group,
  Text,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { IconFileText, IconFolder } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { MoveTargetPage } from "@/features/page/hooks/use-move-to.ts";

interface MoveTargetItemProps {
  page: MoveTargetPage;
  isSelected: boolean;
  disabledReason?: string | null;
  onClick: (page: MoveTargetPage) => void;
}

export default function MoveTargetItem({
  page,
  isSelected,
  disabledReason,
  onClick,
}: MoveTargetItemProps) {
  const { t } = useTranslation();
  const isDisabled = Boolean(disabledReason);
  const icon = page.icon ? (
    <Text size="sm" component="span">
      {page.icon}
    </Text>
  ) : page.nodeType === "folder" ? (
    <IconFolder size={16} />
  ) : (
    <IconFileText size={16} />
  );

  const item = (
    <UnstyledButton
      aria-disabled={isDisabled}
      onClick={() => {
        if (!isDisabled) {
          onClick(page);
        }
      }}
      style={{
        width: "100%",
        minHeight: 46,
        borderRadius: 6,
        opacity: isDisabled ? 0.55 : 1,
        cursor: isDisabled ? "not-allowed" : "pointer",
        background: isSelected
          ? "var(--mantine-color-blue-light)"
          : "transparent",
        borderLeft: isSelected
          ? "3px solid var(--mantine-color-blue-filled)"
          : "3px solid transparent",
        padding: "6px 8px",
      }}
    >
      <Group gap="sm" wrap="nowrap">
        <ThemeIcon
          variant={page.nodeType === "folder" ? "light" : "subtle"}
          color={page.nodeType === "folder" ? "yellow" : "gray"}
          size={28}
          radius={6}
        >
          {icon}
        </ThemeIcon>

        <Box style={{ minWidth: 0, flex: 1 }}>
          <Text size="sm" fw={500} truncate="end">
            {page.title || t("Untitled")}
          </Text>
          <Text size="xs" c="dimmed" truncate="end">
            {page.parentPath || page.spaceName}
          </Text>
        </Box>

        <Badge variant="light" color="gray" size="sm" maw={120}>
          <Text size="xs" truncate="end">
            {page.spaceName}
          </Text>
        </Badge>
      </Group>
    </UnstyledButton>
  );

  if (!disabledReason) {
    return item;
  }

  return (
    <Tooltip label={disabledReason} position="left" withArrow>
      <Box>{item}</Box>
    </Tooltip>
  );
}
