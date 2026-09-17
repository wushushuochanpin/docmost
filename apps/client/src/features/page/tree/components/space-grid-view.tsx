import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@mantine/core";
import {
  IconFileDescription,
  IconFolder,
} from "@tabler/icons-react";

import type { SpaceTreeNode } from "@/features/page/tree/types";
import { buildPageUrl } from "@/features/page/page.utils";
import classes from "./space-grid-view.module.css";

interface SpaceGridViewProps {
  nodes: SpaceTreeNode[];
}

/**
 * Flat card grid for the "all" view's grid layout. Renders root nodes only
 * (no tree expansion) — emoji/icon on top, wrapped title below. Clicking a
 * card navigates to the page.
 */
export function SpaceGridView({ nodes }: SpaceGridViewProps) {
  const { t } = useTranslation();
  const { spaceSlug } = useParams();

  return (
    <div className={classes.grid}>
      {nodes.map((node) => {
        const pageUrl = buildPageUrl(spaceSlug, node.slugId, node.name);
        const title = node.name || t("untitled");
        const icon = node.icon ? (
          <span className={classes.emoji}>{node.icon}</span>
        ) : node.nodeType === "folder" ? (
          <IconFolder size={26} className={classes.fallbackIcon} />
        ) : (
          <IconFileDescription size={26} className={classes.fallbackIcon} />
        );

        return (
          <Tooltip key={node.id} label={title} withArrow position="top" disabled={title.length <= 18}>
            <Link to={pageUrl} className={classes.card} title={title}>
              <div className={classes.iconWrap}>{icon}</div>
              <div className={classes.title}>{title}</div>
            </Link>
          </Tooltip>
        );
      })}
    </div>
  );
}
