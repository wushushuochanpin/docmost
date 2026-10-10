import React from "react";
import type { Editor } from "@tiptap/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { ColorSwatch, Menu } from "@mantine/core";
import { TABLE_COLORS } from "../../table-background-color";
import { ArrowLeft, ArrowRight, PanelLeft, PanelRight, TableProperties, Eraser, Palette, ArrowUpAZ, ArrowDownZA } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTableMoveRowColumn } from "../hooks/use-table-move-row-column";
import { useTableClear } from "../hooks/use-table-clear";
import { useTableSort } from "../hooks/use-table-sort";
import { AlignmentSubmenu } from "./alignment-submenu";

interface ColumnHandleMenuProps {
  editor: Editor;
  index: number;
  tableNode: ProseMirrorNode;
  tablePos: number;
}

export const ColumnHandleMenu = React.memo(function ColumnHandleMenu({
  editor,
  index,
  tableNode,
  tablePos,
}: ColumnHandleMenuProps) {
  const { t } = useTranslation();

  const moveLeft = useTableMoveRowColumn(editor, "col", index, "left", tableNode, tablePos);
  const moveRight = useTableMoveRowColumn(editor, "col", index, "right", tableNode, tablePos);
  const clearCol = useTableClear(editor, tableNode, tablePos, {
    kind: "col",
    index,
  });

  const setBackground = (color: string, name: string) => {
    editor
      .chain()
      .focus()
      .updateAttributes("tableCell", {
        backgroundColor: color || null,
        backgroundColorName: color ? name : null,
      })
      .updateAttributes("tableHeader", {
        backgroundColor: color || null,
        backgroundColorName: color ? name : null,
      })
      .run();
  };

  const sortAsc = useTableSort({
    editor,
    orientation: "col",
    index,
    tableNode,
    tablePos,
    direction: "asc",
  });
  const sortDesc = useTableSort({
    editor,
    orientation: "col",
    index,
    tableNode,
    tablePos,
    direction: "desc",
  });

  return (
    <>
      <Menu.Item
        leftSection={<ArrowUpAZ size={16} />}
        onClick={sortAsc.handleSort}
        disabled={!sortAsc.canSort}
      >
        {t("Sort A → Z")}
      </Menu.Item>
      <Menu.Item
        leftSection={<ArrowDownZA size={16} />}
        onClick={sortDesc.handleSort}
        disabled={!sortDesc.canSort}
      >
        {t("Sort Z → A")}
      </Menu.Item>
      <Menu.Divider />

      <Menu.Sub position="right-start">
        <Menu.Sub.Target>
          <Menu.Sub.Item leftSection={<Palette size={16} />}>
            {t("Background color")}
          </Menu.Sub.Item>
        </Menu.Sub.Target>
        <Menu.Sub.Dropdown>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, padding: 8 }}>
            {TABLE_COLORS.map((c) => (
              <button
                key={c.name}
                type="button"
                onClick={() => setBackground(c.color, c.name)}
                aria-label={t(c.name)}
                style={{
                  border: "none",
                  background: "transparent",
                  padding: 0,
                  cursor: "pointer",
                }}
              >
                <ColorSwatch
                  color={c.color || "#ffffff"}
                  size={22}
                  style={{ border: c.color === "" ? "1px solid #e5e7eb" : undefined }}
                />
              </button>
            ))}
          </div>
        </Menu.Sub.Dropdown>
      </Menu.Sub>

      <AlignmentSubmenu editor={editor} />

      <Menu.Divider />

      <Menu.Item
        leftSection={<PanelLeft size={16} />}
        onClick={() => editor.chain().focus().addColumnBefore().run()}
      >
        {t("Add column left")}
      </Menu.Item>
      <Menu.Item
        leftSection={<PanelRight size={16} />}
        onClick={() => editor.chain().focus().addColumnAfter().run()}
      >
        {t("Add column right")}
      </Menu.Item>

      <Menu.Divider />

      <Menu.Item
        leftSection={<Eraser size={16} />}
        onClick={clearCol}
      >
        {t("Clear cells")}
      </Menu.Item>
      <Menu.Item
        leftSection={<TableProperties size={16} />}
        onClick={() => editor.chain().focus().deleteColumn().run()}
      >
        {t("Delete column")}
      </Menu.Item>

      <Menu.Divider />

      <Menu.Item
        leftSection={<ArrowLeft size={16} />}
        onClick={moveLeft.handleMove}
        disabled={!moveLeft.canMove}
      >
        {t("Move column left")}
      </Menu.Item>
      <Menu.Item
        leftSection={<ArrowRight size={16} />}
        onClick={moveRight.handleMove}
        disabled={!moveRight.canMove}
      >
        {t("Move column right")}
      </Menu.Item>
    </>
  );
});
