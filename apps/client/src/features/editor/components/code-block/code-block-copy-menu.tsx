import { ActionIcon, Menu } from "@mantine/core";
import {
  IconCheck,
  IconCopy,
  IconFileText,
  IconMarkdown,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useClipboard } from "@/hooks/use-clipboard";
import { formatCodeBlockAsMarkdown } from "@/features/editor/utils/clipboard-format";

interface CodeBlockCopyMenuProps {
  text: string;
  language?: string | null;
}

export function CodeBlockCopyMenu({ text, language }: CodeBlockCopyMenuProps) {
  const { t } = useTranslation();
  const clipboard = useClipboard({ timeout: 2000 });
  const markdown = formatCodeBlockAsMarkdown(text, language);

  const copy = (value: string) => {
    clipboard.copy(value);
  };

  return (
    <Menu shadow="md" position="bottom-end" withinPortal>
      <Menu.Target>
        <ActionIcon
          color={clipboard.copied ? "teal" : "gray"}
          variant="subtle"
          aria-label={t("Copy")}
          title={clipboard.copied ? t("Copied") : t("Copy")}
        >
          {clipboard.copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
        </ActionIcon>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Item
          leftSection={<IconFileText size={16} />}
          onClick={() => copy(text)}
        >
          {t("Copy as plain text")}
        </Menu.Item>
        <Menu.Item
          leftSection={<IconMarkdown size={16} />}
          onClick={() => copy(markdown)}
        >
          {t("Copy as Markdown")}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
