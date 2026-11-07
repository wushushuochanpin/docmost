import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Group, Popover, Text, UnstyledButton, Divider, Modal } from "@mantine/core";
import { ChevronDown, Plus } from "lucide-react";
import { useDisclosure } from "@mantine/hooks";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { useGetSpacesQuery } from "@/features/space/queries/space-query";
import { recentSpaceSlugAtom } from "@/features/space/atoms/recent-space-atom";
import { SpaceSelect } from "@/features/space/components/sidebar/space-select";
import { CustomAvatar } from "@/components/ui/custom-avatar.tsx";
import { AvatarIconType } from "@/features/attachments/types/attachment.types.ts";
import { CreateSpaceForm } from "@/features/space/components/create-space-form.tsx";
import useUserRole from "@/hooks/use-user-role";
import { getSpaceUrl } from "@/lib/config";

export function SpaceSwitcher() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [opened, { close, toggle }] = useDisclosure(false);
  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure(false);
  const [recentSpaceSlug, setRecentSpaceSlug] = useAtom(recentSpaceSlugAtom);
  const { isAdmin } = useUserRole();

  const { data: spaces } = useGetSpacesQuery({ limit: 50 });
  const currentSpace = spaces?.items?.find((s) => s.slug === recentSpaceSlug) ?? spaces?.items?.[0];

  useEffect(() => {
    if (!recentSpaceSlug && spaces?.items?.[0]) {
      setRecentSpaceSlug(spaces.items[0].slug);
    }
  }, [recentSpaceSlug, spaces, setRecentSpaceSlug]);

  const handleSelect = (spaceSlug: string) => {
    setRecentSpaceSlug(spaceSlug);
    navigate(getSpaceUrl(spaceSlug));
    close();
  };

  if (!currentSpace) return null;

  return (
    <>
      <Popover
        width={280}
        position="bottom"
        withArrow={false}
        shadow="md"
        opened={opened}
        onChange={toggle}
        trapFocus
        returnFocus
      >
        <Popover.Target>
          <UnstyledButton onClick={toggle} px="xs" py={4}>
            <Group gap={8} wrap="nowrap">
              <CustomAvatar
                name={currentSpace.name}
                avatarUrl={currentSpace.logo}
                type={AvatarIconType.SPACE_ICON}
                color="initials"
                variant="light"
                size={22}
              />
              <Text size="sm" fw={500} lineClamp={1} visibleFrom="sm">
                {currentSpace.name}
              </Text>
              <ChevronDown size={16} strokeWidth={1.75} />
            </Group>
          </UnstyledButton>
        </Popover.Target>
        <Popover.Dropdown p={0}>
          <SpaceSelect
            label={currentSpace.name}
            value={currentSpace.slug}
            onChange={(space) => space && handleSelect(space.slug)}
            width={280}
            opened={true}
          />
          {isAdmin && (
            <>
              <Divider size="xs" />
              <UnstyledButton
                onClick={() => {
                  close();
                  openCreate();
                }}
                w="100%"
                px="md"
                py="sm"
              >
                <Group gap={8}>
                  <Plus size={16} />
                  <Text size="sm">{t("Create space")}</Text>
                </Group>
              </UnstyledButton>
            </>
          )}
        </Popover.Dropdown>
      </Popover>

      <Modal
        opened={createOpened}
        onClose={closeCreate}
        title={t("Create space")}
        closeButtonProps={{ "aria-label": t("Close") }}
      >
        <Divider size="xs" mb="xs" />
        <CreateSpaceForm />
      </Modal>
    </>
  );
}
