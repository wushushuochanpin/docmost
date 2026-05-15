import bytes from "bytes";
import { castToBoolean } from "@/lib/utils.tsx";
import { AvatarIconType } from "@/features/attachments/types/attachment.types.ts";
import { sanitizeUrl } from "@docmost/editor-ext";

declare global {
  interface Window {
    CONFIG?: Record<string, string>;
  }
}

export function getAppName(): string {
  return "SuperChat";
}

export function getAppUrl(): string {
  return `${window.location.protocol}//${window.location.host}`;
}

export function getServerAppUrl(): string {
  return getConfigValue("APP_URL");
}

export function getPublicAppUrl(): string {
  const currentUrl = getAppUrl();
  const serverUrl = getServerAppUrl()?.trim();
  if (serverUrl) {
    try {
      const normalizedServerUrl = new URL(serverUrl).origin;
      const currentHostname = new URL(currentUrl).hostname;
      const serverHostname = new URL(normalizedServerUrl).hostname;

      if (
        isLoopbackHostname(serverHostname) &&
        !isLoopbackHostname(currentHostname)
      ) {
        return currentUrl;
      }

      return normalizedServerUrl;
    } catch {
      return currentUrl;
    }
  }

  return currentUrl;
}

export function getBackendUrl(): string {
  return getAppUrl() + "/api";
}

export function getCollaborationUrl(): string {
  const baseUrl =
    getConfigValue("COLLAB_URL") || getServerAppUrl() || getAppUrl();

  const collabUrl = new URL("/collab", baseUrl);
  collabUrl.protocol = collabUrl.protocol === "https:" ? "wss:" : "ws:";
  return collabUrl.toString();
}

export function isEditorSessionEnabled(): boolean {
  return castToBoolean(getConfigValue("EDITOR_SESSION_ENABLED", "false"));
}

export function isEditorSessionFileEnabled(): boolean {
  return castToBoolean(getConfigValue("EDITOR_SESSION_FILE_ENABLED", "false"));
}

export function getSubdomainHost(): string {
  return getConfigValue("SUBDOMAIN_HOST");
}

export function isCloud(): boolean {
  return castToBoolean(getConfigValue("CLOUD"));
}

export function isBackupEnabled(): boolean {
  return castToBoolean(getConfigValue("BACKUP_ENABLED", "true"));
}

export function isBackupS3Enabled(): boolean {
  return castToBoolean(getConfigValue("BACKUP_S3_ENABLED", "false"));
}

export function getAvatarUrl(
  avatarUrl: string,
  type: AvatarIconType = AvatarIconType.AVATAR,
) {
  if (!avatarUrl) return null;
  if (avatarUrl?.startsWith("http")) return avatarUrl;

  return getBackendUrl() + `/attachments/img/${type}/` + encodeURI(avatarUrl);
}

export function getSpaceUrl(spaceSlug: string) {
  return "/s/" + spaceSlug;
}

export function getFileUrl(src: string) {
  if (!src) return src;
  if (src.startsWith("http")) {
    try {
      const parsedUrl = new URL(src);
      const isInternalFilePath =
        parsedUrl.pathname.startsWith("/api/files/") ||
        parsedUrl.pathname.startsWith("/files/");

      if (isInternalFilePath) {
        const normalizedPath = `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
        return `${getAppUrl()}${normalizedPath}`;
      }
    } catch {
      return src;
    }
    return src;
  }
  if (src.startsWith("/api/")) {
    // Remove the '/api' prefix
    return getBackendUrl() + src.substring(4);
  }
  if (src.startsWith("/files/")) {
    return getBackendUrl() + src;
  }
  return sanitizeUrl(src);
}

export function getFileUploadSizeLimit(): number {
  const limit = getConfigValue("FILE_UPLOAD_SIZE_LIMIT", "50mb");
  const parsed = bytes(limit);
  return Number.isNaN(parsed) || parsed <= 0 ? bytes("50mb") : parsed;
}

export function getFileImportSizeLimit(): number {
  const limit = getConfigValue("FILE_IMPORT_SIZE_LIMIT", "200mb");
  const parsed = bytes(limit);
  return Number.isNaN(parsed) || parsed <= 0 ? bytes("200mb") : parsed;
}

export function getDrawioUrl() {
  return getConfigValue("DRAWIO_URL", "https://embed.diagrams.net");
}

export function getBillingTrialDays() {
  return getConfigValue("BILLING_TRIAL_DAYS");
}

export function getPostHogHost() {
  return getConfigValue("POSTHOG_HOST");
}

export function isPostHogEnabled(): boolean {
  return Boolean(getPostHogHost() && getPostHogKey());
}

export function getPostHogKey() {
  return getConfigValue("POSTHOG_KEY");
}

export type ShareLegacyRouteMode =
  | "observe"
  | "protected_block"
  | "redirect_public"
  | "removed";

export function getShareLegacyRouteMode(): ShareLegacyRouteMode {
  const mode = (getConfigValue("SHARE_LEGACY_ROUTE_MODE", "observe") || "")
    .toLowerCase()
    .trim();

  if (
    mode === "observe" ||
    mode === "protected_block" ||
    mode === "redirect_public" ||
    mode === "removed"
  ) {
    return mode;
  }

  return "observe";
}

function getConfigValue(key: string, defaultValue: string = undefined): string {
  const devConfig = import.meta.env as unknown as Record<
    string,
    string | boolean | undefined
  >;
  const rawValue = import.meta.env.DEV ? devConfig[key] : window?.CONFIG?.[key];
  const normalizedValue =
    typeof rawValue === "string"
      ? rawValue
      : rawValue == null
        ? undefined
        : String(rawValue);
  const value = normalizedValue ?? defaultValue;
  return value === "" ? defaultValue : value;
}

function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}
