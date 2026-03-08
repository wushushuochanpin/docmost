import { useEffect } from "react";
import { getShareWechatSignature } from "@/features/share/services/share-service.ts";
import {
  getDefaultWechatShareImageUrl,
  isWechatUserAgent,
} from "@/features/share/wechat-utils.ts";

type WechatShareData = {
  title: string;
  desc?: string;
  link: string;
  imgUrl?: string;
};

type WechatTimelineShareData = {
  title: string;
  link: string;
  imgUrl?: string;
};

type WechatConfig = {
  debug?: boolean;
  appId: string;
  timestamp: number;
  nonceStr: string;
  signature: string;
  jsApiList: string[];
};

type WechatSdk = {
  config(config: WechatConfig): void;
  ready(callback: () => void): void;
  error?(callback: (error: unknown) => void): void;
  updateAppMessageShareData?(data: WechatShareData): void;
  updateTimelineShareData?(data: WechatTimelineShareData): void;
  onMenuShareAppMessage?(data: WechatShareData): void;
  onMenuShareTimeline?(data: WechatTimelineShareData): void;
};

declare global {
  interface Window {
    wx?: WechatSdk;
  }
}

const WECHAT_JS_API_LIST = [
  "updateAppMessageShareData",
  "updateTimelineShareData",
  "onMenuShareAppMessage",
  "onMenuShareTimeline",
];

let wechatSdkPromise: Promise<WechatSdk | null> | null = null;

async function loadWechatSdk(): Promise<WechatSdk | null> {
  if (typeof window === "undefined") {
    return null;
  }

  if (window.wx) {
    return window.wx;
  }

  if (wechatSdkPromise) {
    return wechatSdkPromise;
  }

  const promise: Promise<WechatSdk | null> = new Promise<WechatSdk | null>(
    (resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(
        'script[data-share-wechat-sdk="true"]',
      );

      if (existing) {
      existing.addEventListener("load", () => resolve(window.wx ?? null), {
        once: true,
      });
      existing.addEventListener(
        "error",
        () => reject(new Error("Failed to load WeChat JS SDK")),
        { once: true },
      );
      return;
    }

      const script = document.createElement("script");
      script.src = "https://res.wx.qq.com/open/js/jweixin-1.6.0.js";
      script.async = true;
      script.setAttribute("data-share-wechat-sdk", "true");
      script.onload = () => resolve(window.wx ?? null);
      script.onerror = () => reject(new Error("Failed to load WeChat JS SDK"));
      document.head.appendChild(script);
    },
  ).catch((error): never => {
    wechatSdkPromise = null;
    throw error;
  });

  wechatSdkPromise = promise;
  return wechatSdkPromise;
}

type UseWechatShareInput = {
  enabled?: boolean;
  shareUrl?: string;
  title?: string;
  description?: string;
  imageUrl?: string;
};

export function useWechatShare(input?: UseWechatShareInput) {
  useEffect(() => {
    if (
      !input?.enabled ||
      !input.shareUrl ||
      typeof window === "undefined" ||
      !isWechatUserAgent()
    ) {
      return;
    }

    const pageUrl = window.location.href.split("#")[0];
    const shareUrl = input.shareUrl.split("#")[0];
    const title = input.title?.trim() || document.title;
    if (!title) {
      return;
    }

    const description = input.description?.trim() || undefined;
    const imageUrl = input.imageUrl?.trim() || getDefaultWechatShareImageUrl();
    let cancelled = false;

    void (async () => {
      try {
        const signature = await getShareWechatSignature(pageUrl);
        if (
          cancelled ||
          !signature.enabled ||
          !signature.appId ||
          !signature.nonceStr ||
          !signature.signature ||
          !signature.timestamp
        ) {
          return;
        }

        const wx = await loadWechatSdk();
        if (!wx || cancelled) {
          return;
        }

        const appMessageData: WechatShareData = {
          title,
          desc: description,
          link: shareUrl,
          imgUrl: imageUrl,
        };
        const timelineData: WechatTimelineShareData = {
          title,
          link: shareUrl,
          imgUrl: imageUrl,
        };

        wx.config({
          debug: false,
          appId: signature.appId,
          timestamp: signature.timestamp,
          nonceStr: signature.nonceStr,
          signature: signature.signature,
          jsApiList: WECHAT_JS_API_LIST,
        });

        wx.ready(() => {
          if (cancelled) {
            return;
          }

          if (typeof wx.updateAppMessageShareData === "function") {
            wx.updateAppMessageShareData(appMessageData);
          } else if (typeof wx.onMenuShareAppMessage === "function") {
            wx.onMenuShareAppMessage(appMessageData);
          }

          if (typeof wx.updateTimelineShareData === "function") {
            wx.updateTimelineShareData(timelineData);
          } else if (typeof wx.onMenuShareTimeline === "function") {
            wx.onMenuShareTimeline(timelineData);
          }
        });
      } catch {
        // WeChat native share enhancement is best-effort only.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    input?.description,
    input?.enabled,
    input?.imageUrl,
    input?.shareUrl,
    input?.title,
  ]);
}
