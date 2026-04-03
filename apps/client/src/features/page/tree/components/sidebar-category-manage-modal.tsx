import {
  ActionIcon,
  Button,
  Divider,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import {
  IconArrowDown,
  IconArrowUp,
  IconCheck,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useCreateSidebarCategoryMutation,
  useDeleteSidebarCategoryMutation,
  useReorderSidebarCategoriesMutation,
  useUpdateSidebarCategoryMutation,
} from "@/features/space/queries/space-query.ts";
import { ISidebarCategory } from "@/features/space/types/sidebar-category.types.ts";

interface SidebarCategoryManageModalProps {
  opened: boolean;
  onClose: () => void;
  spaceId: string;
  categories: ISidebarCategory[];
}

export function SidebarCategoryManageModal({
  opened,
  onClose,
  spaceId,
  categories,
}: SidebarCategoryManageModalProps) {
  const { t } = useTranslation();
  const [newCategoryName, setNewCategoryName] = useState("");
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  const createMutation = useCreateSidebarCategoryMutation();
  const updateMutation = useUpdateSidebarCategoryMutation();
  const deleteMutation = useDeleteSidebarCategoryMutation();
  const reorderMutation = useReorderSidebarCategoriesMutation();

  useEffect(() => {
    if (!opened) {
      return;
    }

    setDraftNames(
      categories.reduce<Record<string, string>>((acc, category) => {
        acc[category.id] = category.name;
        return acc;
      }, {}),
    );
  }, [categories, opened]);

  const isBusy =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending ||
    reorderMutation.isPending;

  const orderedIds = useMemo(
    () => categories.map((category) => category.id),
    [categories],
  );

  const handleCreateCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) {
      return;
    }

    await createMutation.mutateAsync({
      spaceId,
      name,
    });
    setNewCategoryName("");
  };

  const handleUpdateCategory = async (categoryId: string) => {
    const name = draftNames[categoryId]?.trim();
    if (!name) {
      return;
    }

    const category = categories.find((item) => item.id === categoryId);
    if (!category || category.name === name) {
      return;
    }

    await updateMutation.mutateAsync({
      categoryId,
      name,
    });
  };

  const handleDeleteCategory = async (categoryId: string) => {
    await deleteMutation.mutateAsync({
      categoryId,
      spaceId,
    });
  };

  const handleMoveCategory = async (categoryId: string, direction: -1 | 1) => {
    const currentIndex = orderedIds.indexOf(categoryId);
    const nextIndex = currentIndex + direction;

    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= orderedIds.length) {
      return;
    }

    const nextOrder = [...orderedIds];
    [nextOrder[currentIndex], nextOrder[nextIndex]] = [
      nextOrder[nextIndex],
      nextOrder[currentIndex],
    ];

    await reorderMutation.mutateAsync({
      spaceId,
      orderedCategoryIds: nextOrder,
    });
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("Manage categories")}
      size="lg"
      centered
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {t(
            "Categories only apply to root pages and folders. Sub-pages follow their root tree.",
          )}
        </Text>

        <Group align="end" gap="xs">
          <TextInput
            flex={1}
            label={t("New category")}
            placeholder={t("e.g. Startup")}
            value={newCategoryName}
            onChange={(event) => setNewCategoryName(event.currentTarget.value)}
            disabled={isBusy}
          />
          <Button
            leftSection={<IconPlus size={16} stroke={1.8} />}
            onClick={handleCreateCategory}
            loading={createMutation.isPending}
            disabled={!newCategoryName.trim()}
          >
            {t("Add")}
          </Button>
        </Group>

        <Divider />

        <Stack gap="xs">
          {categories.length === 0 ? (
            <Text size="sm" c="dimmed">
              {t("No categories yet")}
            </Text>
          ) : (
            categories.map((category, index) => (
              <Group key={category.id} align="end" gap="xs" wrap="nowrap">
                <TextInput
                  flex={1}
                  label={index === 0 ? t("Existing categories") : undefined}
                  value={draftNames[category.id] ?? category.name}
                  onChange={(event) =>
                    setDraftNames((prev) => ({
                      ...prev,
                      [category.id]: event.currentTarget.value,
                    }))
                  }
                  disabled={isBusy}
                />

                <ActionIcon
                  variant="subtle"
                  size={36}
                  onClick={() => handleMoveCategory(category.id, -1)}
                  disabled={isBusy || index === 0}
                  aria-label={t("Move up")}
                >
                  <IconArrowUp size={16} stroke={1.8} />
                </ActionIcon>

                <ActionIcon
                  variant="subtle"
                  size={36}
                  onClick={() => handleMoveCategory(category.id, 1)}
                  disabled={isBusy || index === categories.length - 1}
                  aria-label={t("Move down")}
                >
                  <IconArrowDown size={16} stroke={1.8} />
                </ActionIcon>

                <ActionIcon
                  variant="subtle"
                  color="blue"
                  size={36}
                  onClick={() => handleUpdateCategory(category.id)}
                  disabled={isBusy || !draftNames[category.id]?.trim()}
                  aria-label={t("Save")}
                >
                  <IconCheck size={16} stroke={1.8} />
                </ActionIcon>

                <ActionIcon
                  variant="subtle"
                  color="red"
                  size={36}
                  onClick={() => handleDeleteCategory(category.id)}
                  disabled={isBusy}
                  aria-label={t("Delete")}
                >
                  <IconTrash size={16} stroke={1.8} />
                </ActionIcon>
              </Group>
            ))
          )}
        </Stack>
      </Stack>
    </Modal>
  );
}
