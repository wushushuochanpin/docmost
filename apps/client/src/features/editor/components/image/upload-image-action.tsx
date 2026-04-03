import { handleImageUpload } from "@docmost/editor-ext";
import { uploadFile } from "@/features/page/services/page-service.ts";
import { notifications } from "@mantine/notifications";
import { getFileUploadSizeLimit } from "@/lib/config.ts";
import { formatBytes } from "@/lib";
import i18n from "@/i18n.ts";

const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|bmp|svg|tiff?|heic|heif)$/i;

function isLikelyImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) {
    return true;
  }
  if (
    (!file.type || file.type === "application/octet-stream") &&
    IMAGE_EXT_RE.test(file.name)
  ) {
    return true;
  }
  return false;
}

export const uploadImageAction = handleImageUpload({
  onUpload: async (file: File, pageId: string): Promise<any> => {
    try {
      return await uploadFile(file, pageId);
    } catch (err) {
      notifications.show({
        color: "red",
        message: err?.response.data.message,
      });
      throw err;
    }
  },
  validateFn: (file) => {
    if (!isLikelyImageFile(file)) {
      return false;
    }
    if (file.size > getFileUploadSizeLimit()) {
      notifications.show({
        color: "red",
        message: i18n.t("File exceeds the {{limit}} attachment limit", {
          limit: formatBytes(getFileUploadSizeLimit()),
        }),
      });
      return false;
    }
    return true;
  },
});
