import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FileText, Folder } from "lucide-react";
import clsx from "clsx";

import type { SpaceTreeNode } from "@/features/page/tree/types.ts";
import { NodeMenu } from "./space-tree-node-menu";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import classes from "./sidebar-node-card.module.css";

type SidebarNodeCardProps = {
  node: SpaceTreeNode;
  readOnly: boolean;
  isSelected?: boolean;
  isDragging?: boolean;
  isReceivingDrop?: "before" | "after" | null;
  cardRef?: React.Ref<HTMLDivElement>;
};

/**
 * Visual card for a flat sidebar grid. Collection layout, keyboard order and
 * drag/drop stay in SidebarNodeGrid; this component only owns presentation
 * and node actions.
 */
export function SidebarNodeCard({
  node,
  readOnly,
  isSelected = false,
  isDragging = false,
  isReceivingDrop = null,
  cardRef,
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
    <div
      ref={cardRef}
      className={clsx(classes.card, {
        [classes.selected]: isSelected,
        [classes.dragging]: isDragging,
        [classes.dropBefore]: isReceivingDrop === "before",
        [classes.dropAfter]: isReceivingDrop === "after",
      })}
      data-node-id={node.id}
    >
      <Link
        to={pageUrl}
        className={classes.link}
        aria-current={isSelected ? "page" : undefined}
        aria-label={title}
      >
        <div className={classes.iconWrap}>{icon}</div>
        <div className={classes.title}>{title}</div>
      </Link>
      <div className={classes.menu}>
        <NodeMenu node={node} canEdit={canEdit} />
      </div>
    </div>
  );
}
