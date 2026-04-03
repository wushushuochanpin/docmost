import { Stack, Text } from "@mantine/core";
import { type TablerIcon } from "@tabler/icons-react";
import { ReactNode } from "react";
import classes from "./empty-state.module.css";

type EmptyStateProps = {
  icon: TablerIcon;
  title: string;
  description?: string;
  action?: ReactNode;
};

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className={classes.root}>
      <Stack align="center" gap="xs">
        <div className={classes.iconWrapper}>
          <Icon size={28} stroke={1.5} color="var(--ui-text-tertiary)" />
        </div>
        <Text size="lg" fw={500}>
          {title}
        </Text>
        {description && (
          <Text size="sm" c="dimmed" maw={350}>
            {description}
          </Text>
        )}
        {action}
      </Stack>
    </div>
  );
}
