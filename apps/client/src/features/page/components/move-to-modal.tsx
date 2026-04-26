import {
  Alert,
  Button,
  Divider,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { IconAlertTriangle, IconSearch } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import MoveTargetItem from "@/features/page/components/move-target-item.tsx";
import { treeDataAtom } from "@/features/page/tree/atoms/tree-data-atom.ts";
import { useMoveTo } from "@/features/page/hooks/use-move-to.ts";

interface MoveToModalProps {
  pageId: string;
  pageTitle: string;
  pageNodeType: "file" | "folder";
  currentSpaceId: string;
  slugId: string;
  recentScopeId?: string | null;
  open: boolean;
  onClose: () => void;
}

export default function MoveToModal({
  pageId,
  pageTitle,
  pageNodeType,
  currentSpaceId,
  slugId,
  recentScopeId,
  open,
  onClose,
}: MoveToModalProps) {
  const { t } = useTranslation();
  const treeData = useAtomValue(treeDataAtom);
  const moveTo = useMoveTo({
    open,
    pageId,
    pageTitle,
    pageNodeType,
    currentSpaceId,
    pageSlugId: slugId,
    recentScopeId,
    treeData,
    onClose,
    t,
  });

  const listTitle = moveTo.query.trim() ? t("Results") : t("Recently opened");
  const listItems = moveTo.query.trim()
    ? moveTo.searchResults
    : moveTo.recentPages;
  const moving = moveTo.phase === "moving";
  const showCrossSpaceConfirm =
    moveTo.phase === "cross_space" && moveTo.targetPage;
  const targetDisabledReason = moveTo.targetPage
    ? moveTo.getDisabledReason(moveTo.targetPage)
    : null;

  return (
    <Modal.Root
      opened={open}
      onClose={moving ? () => undefined : onClose}
      size={540}
      padding="xl"
      yOffset="10vh"
      xOffset={0}
      closeOnClickOutside={!moving}
      closeOnEscape={!moving}
      onClick={(event) => event.stopPropagation()}
    >
      <Modal.Overlay blur={1} />
      <Modal.Content style={{ overflow: "hidden" }}>
        <Modal.Header py={0}>
          <Modal.Title fw={500}>
            {t('Move "{{title}}" to...', {
              title: pageTitle || t("Untitled"),
            })}
          </Modal.Title>
          <Modal.CloseButton disabled={moving} />
        </Modal.Header>

        <Modal.Body>
          {showCrossSpaceConfirm ? (
            <Stack gap="md">
              <Alert color="yellow" icon={<IconAlertTriangle size={18} />}>
                <Text size="sm">
                  {t(
                    'This will move "{{title}}" and all its sub-pages to the "{{space}}" space.',
                    {
                      title: pageTitle || t("Untitled"),
                      space: moveTo.targetPage.spaceName,
                    },
                  )}
                </Text>
              </Alert>

              <Group justify="end" gap="xs">
                <Button
                  variant="subtle"
                  onClick={moveTo.backToSelected}
                  disabled={moving}
                >
                  {t("Cancel")}
                </Button>
                <Button onClick={moveTo.submitMove} loading={moving}>
                  {t("Confirm Move")}
                </Button>
              </Group>
            </Stack>
          ) : (
            <Stack gap="sm">
              <TextInput
                leftSection={<IconSearch size={16} />}
                placeholder={t("Search or paste a link...")}
                value={moveTo.query}
                onChange={(event) => moveTo.setQuery(event.currentTarget.value)}
                disabled={moving}
                error={moveTo.urlError}
                autoFocus
              />

              {moveTo.targetPage && (
                <Alert color="blue" variant="light" py="xs">
                  <Group justify="space-between" gap="sm" wrap="nowrap">
                    <div style={{ minWidth: 0 }}>
                      <Text size="sm" fw={500} truncate="end">
                        {t("Move to: {{title}}", {
                          title: moveTo.targetPage.title || t("Untitled"),
                        })}
                      </Text>
                      <Text size="xs" c="dimmed" truncate="end">
                        {targetDisabledReason ||
                          moveTo.targetPage.parentPath ||
                          moveTo.targetPage.spaceName}
                      </Text>
                    </div>
                    <Button
                      size="xs"
                      variant="subtle"
                      onClick={moveTo.resetSelection}
                    >
                      {t("Clear")}
                    </Button>
                  </Group>
                </Alert>
              )}

              <Divider label={listTitle} labelPosition="left" />

              <ScrollArea.Autosize mah={280} type="auto" offsetScrollbars>
                {moveTo.isLoading && moveTo.phase !== "moving" ? (
                  <Group justify="center" py="xl">
                    <Loader size="sm" />
                  </Group>
                ) : listItems.length > 0 ? (
                  <Stack gap={4}>
                    {listItems.map((item) => (
                      <MoveTargetItem
                        key={item.id}
                        page={item}
                        isSelected={moveTo.targetPage?.id === item.id}
                        disabledReason={moveTo.getDisabledReason(item)}
                        onClick={moveTo.selectTarget}
                      />
                    ))}
                  </Stack>
                ) : (
                  <Text size="sm" c="dimmed" ta="center" py="xl">
                    {moveTo.query.trim()
                      ? t("No results found")
                      : t("No recent pages")}
                  </Text>
                )}
              </ScrollArea.Autosize>

              {moveTo.error && (
                <Text size="sm" c="red">
                  {moveTo.error}
                </Text>
              )}

              <Group justify="end" mt="xs" gap="xs">
                <Button variant="subtle" onClick={onClose} disabled={moving}>
                  {t("Cancel")}
                </Button>
                <Button
                  onClick={moveTo.submitMove}
                  disabled={!moveTo.targetPage || Boolean(targetDisabledReason)}
                  loading={moving}
                >
                  {t("Move Here")}
                </Button>
              </Group>
            </Stack>
          )}
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
