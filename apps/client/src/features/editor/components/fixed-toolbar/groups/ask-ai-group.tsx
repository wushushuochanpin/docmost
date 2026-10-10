import { FC } from "react";
import { Button } from "@mantine/core";
import { Sparkles } from "lucide-react";
import { useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { showAiMenuAtom } from "@/features/editor/atoms/editor-atoms";

export const AskAiGroup: FC = () => {
  const { t } = useTranslation();
  const setShowAiMenu = useSetAtom(showAiMenuAtom);

  return (
    <Button
      variant="subtle"
      color="dark"
      size="xs"
      leftSection={<Sparkles size={14} />}
      onClick={() => setShowAiMenu(true)}
    >
      {t("Ask AI")}
    </Button>
  );
};
