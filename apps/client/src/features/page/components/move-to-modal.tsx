import {
  Alert,
  Box,
  Button,
  Group,
  Kbd,
  Loader,
  Modal,
  ScrollArea,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { IconAlertTriangle, IconSearch } from "@tabler/icons-react";
import { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import MoveTargetItem from "@/features/page/components/move-target-item.tsx";
import { treeDataAtom } from "@/features/page/tree/atoms/tree-data-atom.ts";
import { useMoveTo } from "@/features/page/hooks/use-move-to.ts";
import classes from "./move-to-modal.module.css";

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
  const canSubmit =
    Boolean(moveTo.targetPage) && !targetDisabledReason && !moving;

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && canSubmit) {
      event.preventDefault();
      moveTo.submitMove();
    }
  };

  return (
    <Modal.Root
      opened={open}
      onClose={moving ? () => undefined : onClose}
      size={600}
      padding={0}
      yOffset="6vh"
      xOffset={0}
      zIndex={1000}
      closeOnClickOutside={!moving}
      closeOnEscape={!moving}
      onClick={(event) => event.stopPropagation()}
    >
      <Modal.Overlay blur={1} />
      <Modal.Content className={classes.content}>
        <Modal.Header className={classes.header}>
          <Box className={classes.titleBlock}>
            <Modal.Title className={classes.title}>
              {t('Move "{{title}}" to...', {
                title: pageTitle || t("Untitled"),
              })}
            </Modal.Title>
            <Text size="xs" c="dimmed" truncate="end">
              {moveTo.targetPage
                ? moveTo.targetPage.parentPath || moveTo.targetPage.spaceName
                : t("Search or paste a link...")}
            </Text>
          </Box>
          <Modal.CloseButton disabled={moving} />
        </Modal.Header>

        <Modal.Body className={classes.body}>
          {showCrossSpaceConfirm ? (
            <Stack gap="md" p="lg">
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
            <Stack gap={0}>
              <TextInput
                leftSection={<IconSearch size={16} />}
                placeholder={t("Search or paste a link...")}
                value={moveTo.query}
                onChange={(event) => moveTo.setQuery(event.currentTarget.value)}
                onKeyDown={handleSearchKeyDown}
                disabled={moving}
                error={moveTo.urlError}
                autoFocus
                classNames={{
                  root: classes.searchRoot,
                  input: classes.searchInput,
                }}
              />

              <Group className={classes.listHeader} justify="space-between">
                <Text size="xs" fw={600} c="dimmed">
                  {listTitle}
                </Text>
                <Group gap={6} visibleFrom="sm">
                  <Kbd size="xs">↵</Kbd>
                </Group>
              </Group>

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
                <Text size="sm" c="red" px="lg" pt="sm">
                  {moveTo.error}
                </Text>
              )}

              <Group
                className={classes.footer}
                justify="space-between"
                gap="sm"
              >
                <Box className={classes.footerTarget}>
                  {moveTo.targetPage ? (
                    <>
                      <Text size="xs" c="dimmed">
                        {t("Move to: {{title}}", {
                          title: moveTo.targetPage.title || t("Untitled"),
                        })}
                      </Text>
                      <Text
                        size="xs"
                        c={targetDisabledReason ? "red" : "dimmed"}
                        truncate="end"
                      >
                        {targetDisabledReason ||
                          moveTo.targetPage.parentPath ||
                          moveTo.targetPage.spaceName}
                      </Text>
                    </>
                  ) : (
                    <Text size="xs" c="dimmed">
                      {t("Recently opened")}
                    </Text>
                  )}
                </Box>
                <Group gap="xs" wrap="nowrap">
                  {moveTo.targetPage && (
                    <Button
                      size="sm"
                      variant="subtle"
                      color="gray"
                      onClick={moveTo.resetSelection}
                      disabled={moving}
                    >
                      {t("Clear")}
                    </Button>
                  )}
                  <Button variant="subtle" onClick={onClose} disabled={moving}>
                    {t("Cancel")}
                  </Button>
                  <Button
                    onClick={moveTo.submitMove}
                    disabled={!canSubmit}
                    loading={moving}
                  >
                    {t("Move Here")}
                  </Button>
                </Group>
              </Group>
            </Stack>
          )}
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
