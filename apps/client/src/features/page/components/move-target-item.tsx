import {
  Badge,
  Box,
  Group,
  Text,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { IconCheck, IconFileText, IconFolder } from "@tabler/icons-react";
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
        minHeight: 52,
        borderRadius: 8,
        opacity: isDisabled ? 0.55 : 1,
        cursor: isDisabled ? "not-allowed" : "pointer",
        background: isSelected ? "rgba(37, 99, 235, 0.10)" : "transparent",
        boxShadow: isSelected
          ? "inset 0 0 0 1px rgba(37, 99, 235, 0.24)"
          : "inset 0 0 0 1px transparent",
        padding: "8px 10px",
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

        {isSelected ? (
          <ThemeIcon variant="filled" color="blue" size={22} radius="xl">
            <IconCheck size={14} stroke={2.4} />
          </ThemeIcon>
        ) : (
          <Badge variant="light" color="gray" size="sm" maw={112}>
            <Text size="xs" truncate="end">
              {page.spaceName}
            </Text>
          </Badge>
        )}
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
