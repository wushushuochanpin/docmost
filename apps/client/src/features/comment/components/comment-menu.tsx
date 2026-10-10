import { ActionIcon, Menu, Tooltip } from "@mantine/core";
import { MoreHorizontal, Edit, Trash, CircleCheck } from "lucide-react";
import { modals } from "@mantine/modals";
import { useTranslation } from "react-i18next";
import { useHasFeature } from "@/ee/hooks/use-feature";
import { Feature } from "@/ee/features";
import { useUpgradeLabel } from "@/ee/hooks/use-upgrade-label";

type CommentMenuProps = {
  onEditComment: () => void;
  onDeleteComment: () => void;
  onResolveComment?: () => void;
  canEdit?: boolean;
  isResolved?: boolean;
  isParentComment?: boolean;
};

function CommentMenu({
  onEditComment,
  onDeleteComment,
  onResolveComment,
  canEdit = true,
  isResolved = false,
  isParentComment = false,
}: CommentMenuProps) {
  const { t } = useTranslation();
  const canResolve = useHasFeature(Feature.COMMENT_RESOLUTION);
  const upgradeLabel = useUpgradeLabel();

  //@ts-ignore
  const openDeleteModal = () =>
    modals.openConfirmModal({
      title: t("Are you sure you want to delete this comment?"),
      centered: true,
      labels: { confirm: t("Delete"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: onDeleteComment,
    });

  return (
    <Menu shadow="md" width={200}>
      <Menu.Target>
        <ActionIcon
          variant="default"
          style={{ border: "none" }}
          aria-label={t("Comment menu")}
        >
          <MoreHorizontal size={18} strokeWidth={1.75} />
        </ActionIcon>
      </Menu.Target>

      <Menu.Dropdown>
        {canEdit && (
          <Menu.Item
            onClick={onEditComment}
            leftSection={<Edit size={14} />}
          >
            {t("Edit comment")}
          </Menu.Item>
        )}
        {isParentComment &&
          (canResolve ? (
            <Menu.Item
              onClick={onResolveComment}
              leftSection={
                isResolved ? (
                  <CircleCheck size={14} />
                ) : (
                  <CircleCheck size={14} />
                )
              }
            >
              {isResolved ? t("Re-open comment") : t("Resolve comment")}
            </Menu.Item>
          ) : (
            <Tooltip label={upgradeLabel} position="left" withinPortal={false}>
              <Menu.Item disabled leftSection={<CircleCheck size={14} />}>
                {t("Resolve comment")}
              </Menu.Item>
            </Tooltip>
          ))}
        <Menu.Item
          leftSection={<Trash size={14} />}
          onClick={openDeleteModal}
        >
          {t("Delete comment")}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

export default CommentMenu;
