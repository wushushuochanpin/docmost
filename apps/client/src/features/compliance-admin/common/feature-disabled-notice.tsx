import { Alert, Text } from "@mantine/core";
import { Lock } from "lucide-react";
import { useTranslation } from "react-i18next";

interface FeatureDisabledNoticeProps {
  title: string;
  message?: string;
}

export default function FeatureDisabledNotice({
  title,
  message,
}: FeatureDisabledNoticeProps) {
  const { t } = useTranslation();

  return (
    <Alert
      variant="light"
      color="gray"
      radius="md"
      icon={<Lock size={18} />}
      title={title}
    >
      <Text size="sm">
        {message ??
          t("This feature is not enabled for the current workspace.")}
      </Text>
    </Alert>
  );
}
