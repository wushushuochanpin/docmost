import {
  Alert,
  Box,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { IconAlertCircle, IconCheck, IconCopy } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { CopyButton } from "@/components/common/copy-button.tsx";

interface ApiKeyValueModalProps {
  opened: boolean;
  tokenName?: string;
  tokenValue?: string;
  onClose: () => void;
}

export default function ApiKeyValueModal({
  opened,
  tokenName,
  tokenValue,
  onClose,
}: ApiKeyValueModalProps) {
  const { t } = useTranslation();

  return (
    <Modal.Root opened={opened} onClose={onClose} centered size="lg">
      <Modal.Overlay blur={1} />
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>{t("Your new API key")}</Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body>
          <Stack>
            <Alert color="yellow" icon={<IconAlertCircle size={18} />}>
              {t("Store this token securely. It will not be shown again.")}
            </Alert>

            {tokenName && (
              <Text size="sm" c="dimmed">
                {t("Name")}: {tokenName}
              </Text>
            )}

            <Box
              p="md"
              style={{
                borderRadius: 8,
                background: "var(--mantine-color-gray-0)",
                fontFamily: "var(--mantine-font-family-monospace)",
                wordBreak: "break-all",
              }}
            >
              {tokenValue}
            </Box>

            <Group justify="space-between">
              <CopyButton value={tokenValue ?? ""}>
                {({ copied, copy }) => (
                  <UnstyledButton onClick={copy}>
                    <Group gap={8}>
                      {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                      <Text size="sm">
                        {copied ? t("Copied") : t("Copy token")}
                      </Text>
                    </Group>
                  </UnstyledButton>
                )}
              </CopyButton>

              <Button onClick={onClose}>{t("Close")}</Button>
            </Group>
          </Stack>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
