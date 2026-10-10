import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FileText, Folder } from "lucide-react";
import clsx from "clsx";

import type { SpaceTreeNode } from "@/features/page/tree/types.ts";
import type { RenderRowProps } from "./doc-tree";
import { NodeMenu } from "./space-tree-node-menu";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import classes from "./sidebar-node-card.module.css";

type SidebarNodeCardProps = RenderRowProps<SpaceTreeNode> & {
  readOnly: boolean;
};

/**
 * Card variant of the sidebar row, used by the grid layout. Rendered inside
 * the shared DocTree engine, so grid rows get virtual scrolling, roving
 * tabindex keyboard navigation and pragmatic-dnd drag sorting for free —
 * plus the shared NodeMenu (right-click / kebab) actions.
 */
export function SidebarNodeCard({
  node,
  isSelected,
  isDragging,
  isReceivingDrop,
  rowRef,
  tabIndex,
  treeItemProps,
  readOnly,
}: SidebarNodeCardProps) {
  const { t } = useTranslation();
  const { spaceSlug } = useParams();
  const pageUrl = buildPageUrl(spaceSlug, node.slugId, node.name);
  const canEdit = !readOnly && node.canEdit !== false;
  const title = node.name || t("untitled");
  const icon = node.icon ? (
    <span className={classes.emoji}>{node.icon}</span>
  ) : node.nodeType === "folder" ? (
    <Folder size={24} className={classes.fallbackIcon} />
  ) : (
    <FileText size={24} className={classes.fallbackIcon} />
  );

  return (
    <Link
      ref={rowRef as React.Ref<HTMLAnchorElement>}
      to={pageUrl}
      className={clsx(classes.card, {
        [classes.selected]: isSelected,
        [classes.dragging]: isDragging,
        [classes.dropBefore]: isReceivingDrop === "before",
        [classes.dropAfter]: isReceivingDrop === "after",
      })}
      tabIndex={tabIndex}
      {...treeItemProps}
    >
      <div className={classes.iconWrap}>{icon}</div>
      <div className={classes.title}>{title}</div>
      <div className={classes.menu}>
        <NodeMenu node={node} canEdit={canEdit} />
      </div>
    </Link>
  );
}
