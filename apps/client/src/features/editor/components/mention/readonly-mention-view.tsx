import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { ActionIcon, Anchor, Text } from "@mantine/core";
import { IconFileDescription } from "@tabler/icons-react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  buildPageUrl,
  buildSharedPageUrl,
} from "@/features/page/page.utils.ts";
import { extractPageSlugId } from "@/lib";
import classes from "./mention.module.css";

export default function ReadonlyMentionView(props: NodeViewProps) {
  const { node, editor } = props;
  const { label, entityType, slugId, anchorId } = node.attrs;
  const { spaceSlug, pageSlug, shareId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const isShareRoute = location.pathname.startsWith("/share");
  const currentPageSlugId = extractPageSlugId(pageSlug);
  const isSamePage = currentPageSlugId === slugId;

  const handleClick = (event: React.MouseEvent) => {
    if (!isSamePage || !anchorId) {
      return;
    }

    event.preventDefault();

    const element = document.querySelector(`[id="${anchorId}"]`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      navigate(`#${anchorId}`, { replace: true });
    }
  };

  return (
    <NodeViewWrapper
      style={{ display: "inline" }}
      data-drag-handle={editor.isEditable ? true : undefined}
    >
      {entityType === "user" && (
        <Text className={classes.userMention} component="span">
          @{label}
        </Text>
      )}

      {entityType === "page" && (
        <Anchor
          component={Link}
          fw={500}
          to={
            isShareRoute
              ? buildSharedPageUrl({
                  shareId,
                  pageSlugId: slugId,
                  pageTitle: label,
                  anchorId,
                })
              : buildPageUrl(spaceSlug, slugId, label, anchorId)
          }
          onClick={handleClick}
          underline="never"
          className={classes.pageMentionLink}
          draggable={false}
        >
          <ActionIcon
            variant="transparent"
            color="gray"
            component="span"
            size={18}
            style={{ verticalAlign: "text-bottom" }}
          >
            <IconFileDescription size={18} />
          </ActionIcon>

          <span className={classes.pageMentionText}>{label}</span>
        </Anchor>
      )}
    </NodeViewWrapper>
  );
}
