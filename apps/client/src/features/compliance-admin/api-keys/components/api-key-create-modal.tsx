import { useEffect, useState } from "react";
import {
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ICreateApiKeyInput } from "../types/api-key.types.ts";

interface ApiKeyCreateModalProps {
  opened: boolean;
  loading?: boolean;
  onClose: () => void;
  onCreate: (payload: ICreateApiKeyInput) => Promise<void> | void;
}

type ExpiryOption = "never" | "30" | "90" | "365";

function toExpiresAt(value: ExpiryOption) {
  if (value === "never") {
    return null;
  }

  const days = Number(value);
  const next = new Date();
  next.setDate(next.getDate() + days);
  return next.toISOString();
}

export default function ApiKeyCreateModal({
  opened,
  loading,
  onClose,
  onCreate,
}: ApiKeyCreateModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState<ExpiryOption>("90");

  useEffect(() => {
    if (!opened) {
      setName("");
      setExpiry("90");
    }
  }, [opened]);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    await onCreate({
      name: trimmed,
      expiresAt: toExpiresAt(expiry),
    });
  };

  return (
    <Modal.Root opened={opened} onClose={onClose} centered>
      <Modal.Overlay blur={1} />
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>{t("Create API key")}</Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body>
          <Stack>
            <Text size="sm" c="dimmed">
              {t(
                "Create a token for scripts, integrations, or internal automation.",
              )}
            </Text>

            <TextInput
              label={t("API key name")}
              placeholder={t("e.g. CI deployment")}
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              autoFocus
            />

            <Select
              label={t("Expiration")}
              data={[
                { value: "never", label: t("Never") },
                { value: "30", label: t("30 days") },
                { value: "90", label: t("90 days") },
                { value: "365", label: t("365 days") },
              ]}
              value={expiry}
              onChange={(value) => setExpiry((value as ExpiryOption) || "90")}
              allowDeselect={false}
            />

            <Group justify="flex-end">
              <Button variant="default" onClick={onClose}>
                {t("Cancel")}
              </Button>
              <Button
                onClick={handleSubmit}
                loading={loading}
                disabled={!name.trim()}
              >
                {t("Create")}
              </Button>
            </Group>
          </Stack>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
