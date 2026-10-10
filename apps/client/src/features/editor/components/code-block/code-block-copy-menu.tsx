import { ActionIcon, Menu } from "@mantine/core";
import { Check, Copy, FileText, FileCode } from "lucide-react";
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
          {clipboard.copied ? <Check size={16} /> : <Copy size={16} />}
        </ActionIcon>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Item
          leftSection={<FileText size={16} />}
          onClick={() => copy(text)}
        >
          {t("Copy as plain text")}
        </Menu.Item>
        <Menu.Item
          leftSection={<FileCode size={16} />}
          onClick={() => copy(markdown)}
        >
          {t("Copy as Markdown")}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
