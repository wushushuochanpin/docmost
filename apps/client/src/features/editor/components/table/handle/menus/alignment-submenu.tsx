import React from "react";
import type { Editor } from "@tiptap/react";
import { Menu } from "@mantine/core";
import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";
import { useTranslation } from "react-i18next";

interface AlignmentSubmenuProps {
  editor: Editor;
}

export const AlignmentSubmenu = React.memo(function AlignmentSubmenu({
  editor,
}: AlignmentSubmenuProps) {
  const { t } = useTranslation();

  return (
    <Menu.Sub position="right-start">
      <Menu.Sub.Target>
        <Menu.Sub.Item leftSection={<AlignLeft size={16} />}>
          {t("Text alignment")}
        </Menu.Sub.Item>
      </Menu.Sub.Target>
      <Menu.Sub.Dropdown>
        <Menu.Item
          leftSection={<AlignLeft size={16} />}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
        >
          {t("Align left")}
        </Menu.Item>
        <Menu.Item
          leftSection={<AlignCenter size={16} />}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
        >
          {t("Align center")}
        </Menu.Item>
        <Menu.Item
          leftSection={<AlignRight size={16} />}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
        >
          {t("Align right")}
        </Menu.Item>
      </Menu.Sub.Dropdown>
    </Menu.Sub>
  );
});
