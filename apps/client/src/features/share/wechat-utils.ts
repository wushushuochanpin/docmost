export function isWechatUserAgent() {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /MicroMessenger/i.test(navigator.userAgent || "");
}

export function getDefaultWechatShareImageUrl() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return new URL("/icons/app-icon-512x512.png", window.location.origin).toString();
}
