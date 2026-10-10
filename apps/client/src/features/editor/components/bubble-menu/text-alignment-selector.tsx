import React, { Dispatch, FC, SetStateAction } from "react";
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Check, ChevronDown } from "lucide-react";
import { Menu, Button, Tooltip, rem } from "@mantine/core";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { useTranslation } from "react-i18next";

interface TextAlignmentProps {
  editor: Editor | null;
  isOpen: boolean;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
}

export interface BubbleMenuItem {
  name: string;
  icon: React.ElementType;
  command: () => void;
  isActive: () => boolean;
}

export const TextAlignmentSelector: FC<TextAlignmentProps> = ({
  editor,
  isOpen,
  setIsOpen,
}) => {
  const { t } = useTranslation();

  const editorState = useEditorState({
    editor,
    selector: (ctx) => {
      if (!ctx.editor) {
        return null;
      }

      return {
        isAlignLeft: ctx.editor.isActive({ textAlign: "left" }),
        isAlignCenter: ctx.editor.isActive({ textAlign: "center" }),
        isAlignRight: ctx.editor.isActive({ textAlign: "right" }),
        isAlignJustify: ctx.editor.isActive({ textAlign: "justify" }),
      };
    },
  });

  if (!editor || !editorState) {
    return null;
  }

  const items: BubbleMenuItem[] = [
    {
      name: "Align left",
      isActive: () => editorState?.isAlignLeft,
      command: () => editor.chain().focus().setTextAlign("left").run(),
      icon: AlignLeft,
    },
    {
      name: "Align center",
      isActive: () => editorState?.isAlignCenter,
      command: () => editor.chain().focus().setTextAlign("center").run(),
      icon: AlignCenter,
    },
    {
      name: "Align right",
      isActive: () => editorState?.isAlignRight,
      command: () => editor.chain().focus().setTextAlign("right").run(),
      icon: AlignRight,
    },
    {
      name: "Justify",
      isActive: () => editorState?.isAlignJustify,
      command: () => editor.chain().focus().setTextAlign("justify").run(),
      icon: AlignJustify,
    },
  ];

  const activeItem = items.filter((item) => item.isActive()).pop() ?? items[0];

  return (
    <Menu
      shadow="md"
      position="bottom-start"
      withArrow={false}
      opened={isOpen}
      onChange={setIsOpen}
    >
      <Menu.Target>
        <Tooltip label={t("Text align")} withArrow disabled={isOpen}>
          <Button
            variant="default"
            style={{ border: "none", height: "34px" }}
            px="5"
            radius="0"
            rightSection={<ChevronDown size={16} />}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setIsOpen(!isOpen)}
            aria-label={t("Text align")}
            aria-haspopup="menu"
            aria-expanded={isOpen}
          >
            <activeItem.icon style={{ width: rem(16) }} strokeWidth={2} />
          </Button>
        </Tooltip>
      </Menu.Target>

      <Menu.Dropdown>
        {items.map((item, index) => (
          <Menu.Item
            key={index}
            leftSection={<item.icon size={16} />}
            rightSection={
              activeItem.name === item.name ? <Check size={16} /> : null
            }
            onClick={() => {
              item.command();
              setIsOpen(false);
            }}
          >
            {t(item.name)}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
};
