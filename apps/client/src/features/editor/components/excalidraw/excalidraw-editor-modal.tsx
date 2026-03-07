import "@excalidraw/excalidraw/index.css";

import {
  Excalidraw,
  exportToSvg,
  loadFromBlob,
  useHandleLibrary,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import {
  Button,
  Group,
  useComputedColorScheme,
} from "@mantine/core";
import { useEffect, useState } from "react";
import ReactClearModal from "react-clear-modal";
import { useTranslation } from "react-i18next";
import { uploadFile } from "@/features/page/services/page-service.ts";
import type { IAttachment } from "@/features/attachments/types/attachment.types";
import { getFileUrl } from "@/lib/config.ts";
import { svgStringToFile } from "@/lib";
import { localStorageLibraryAdapter } from "./excalidraw-utils.ts";

interface ExcalidrawEditorModalProps {
  attachmentId?: string | null;
  onClose: () => void;
  onSaveSuccess: (attachment: IAttachment) => void;
  opened: boolean;
  pageId?: string;
  src?: string | null;
}

export default function ExcalidrawEditorModal({
  attachmentId,
  onClose,
  onSaveSuccess,
  opened,
  pageId,
  src,
}: ExcalidrawEditorModalProps) {
  const { t } = useTranslation();
  const computedColorScheme = useComputedColorScheme();
  const [excalidrawAPI, setExcalidrawAPI] =
    useState<ExcalidrawImperativeAPI>(null);
  const [initialData, setInitialData] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);

  useHandleLibrary({
    excalidrawAPI,
    adapter: localStorageLibraryAdapter,
  });

  useEffect(() => {
    if (!opened) {
      setInitialData(null);
      return;
    }

    let cancelled = false;

    const loadInitialData = async () => {
      if (!src) {
        setInitialData(null);
        return;
      }

      try {
        const request = await fetch(getFileUrl(src), {
          credentials: "include",
          cache: "no-store",
        });
        const data = await loadFromBlob(await request.blob(), null, null);

        if (!cancelled) {
          setInitialData(data);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setInitialData(null);
        }
      }
    };

    void loadInitialData();

    return () => {
      cancelled = true;
    };
  }, [opened, src]);

  const handleSave = async () => {
    if (!excalidrawAPI || !pageId || isSaving) {
      return;
    }

    setIsSaving(true);

    try {
      const svg = await exportToSvg({
        elements: excalidrawAPI.getSceneElements(),
        appState: {
          exportEmbedScene: true,
          exportWithDarkMode: false,
        },
        files: excalidrawAPI.getFiles(),
      });

      const serializer = new XMLSerializer();
      let svgString = serializer.serializeToString(svg);

      svgString = svgString.replace(
        /https:\/\/unpkg\.com\/@excalidraw\/excalidraw@undefined/g,
        "https://unpkg.com/@excalidraw/excalidraw@latest",
      );

      const svgFile = await svgStringToFile(svgString, "diagram.excalidraw.svg");
      const attachment = attachmentId
        ? await uploadFile(svgFile, pageId, attachmentId)
        : await uploadFile(svgFile, pageId);

      onSaveSuccess(attachment);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ReactClearModal
      style={{
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        padding: 0,
        zIndex: 200,
      }}
      isOpen={opened}
      onRequestClose={onClose}
      disableCloseOnBgClick={true}
      contentProps={{
        style: {
          padding: 0,
          width: "90vw",
        },
      }}
    >
      <Group justify="flex-end" wrap="nowrap" bg="var(--mantine-color-body)" p="xs">
        <Button onClick={handleSave} size="compact-sm" loading={isSaving}>
          {t("Save & Exit")}
        </Button>
        <Button onClick={onClose} color="red" size="compact-sm">
          {t("Exit")}
        </Button>
      </Group>

      <div style={{ height: "90vh" }}>
        <Excalidraw
          excalidrawAPI={(api) => setExcalidrawAPI(api)}
          initialData={{
            ...initialData,
            scrollToContent: true,
          }}
          theme={computedColorScheme}
        />
      </div>
    </ReactClearModal>
  );
}
