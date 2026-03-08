import React, { useEffect, useMemo, useState } from "react";
import { Button, Group, Image, Text } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconBrandWechat, IconCopy } from "@tabler/icons-react";
import { CopyButton } from "@/components/common/copy-button";
import classes from "@/features/share/components/share.module.css";
import { useTranslation } from "react-i18next";

interface ShareWechatPanelProps {
  shareLink: string;
  copyValue?: string;
}

function isWechatUserAgent() {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /MicroMessenger/i.test(navigator.userAgent || "");
}

export default function ShareWechatPanel({
  shareLink,
  copyValue,
}: ShareWechatPanelProps) {
  const { t } = useTranslation();
  const isMobile = useMediaQuery("(max-width: 48em)");
  const isWechat = useMemo(isWechatUserAgent, []);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function renderQrCode() {
      if (!shareLink || isMobile || isWechat) {
        setQrCodeDataUrl("");
        return;
      }

      try {
        const { default: QRCode } = await import("qrcode");
        const dataUrl = await QRCode.toDataURL(shareLink, {
          width: 176,
          margin: 1,
          errorCorrectionLevel: "M",
        });

        if (!cancelled) {
          setQrCodeDataUrl(dataUrl);
        }
      } catch {
        if (!cancelled) {
          setQrCodeDataUrl("");
        }
      }
    }

    void renderQrCode();

    return () => {
      cancelled = true;
    };
  }, [isMobile, isWechat, shareLink]);

  if (!shareLink) {
    return null;
  }

  if (isWechat) {
    return (
      <section className={classes.shareWechatPanel}>
        <Group gap={8} mb={8} wrap="nowrap">
          <IconBrandWechat size={18} />
          <Text size="sm" fw={600}>
            {t("Share with WeChat")}
          </Text>
        </Group>
        <Text size="sm">
          {t(
            "Open the top-right menu in WeChat to send to friends or share to Moments.",
          )}
        </Text>
      </section>
    );
  }

  if (isMobile) {
    return (
      <section className={classes.shareWechatPanel}>
        <Group gap={8} mb={8} wrap="nowrap">
          <IconBrandWechat size={18} />
          <Text size="sm" fw={600}>
            {t("Share with WeChat")}
          </Text>
        </Group>
        <Text size="sm" mb={10}>
          {t(
            "Copy the link, open WeChat, and paste it into a chat. If you open the page inside WeChat later, you can also share it to Moments from the top-right menu.",
          )}
        </Text>
        <CopyButton value={copyValue || shareLink} timeout={2000}>
          {({ copied, copy }) => (
            <Button
              variant="light"
              leftSection={<IconCopy size={14} />}
              onClick={copy}
            >
              {copied ? t("Copied") : t("Copy for WeChat")}
            </Button>
          )}
        </CopyButton>
      </section>
    );
  }

  return (
    <section className={classes.shareWechatPanel}>
      <Group gap={8} mb={8} wrap="nowrap">
        <IconBrandWechat size={18} />
        <Text size="sm" fw={600}>
          {t("Share with WeChat")}
        </Text>
      </Group>
      <Text size="sm" mb={12}>
        {t(
          "Scan this code with WeChat. After the page opens in WeChat, use the top-right menu to send it to friends or share it to Moments.",
        )}
      </Text>
      {qrCodeDataUrl ? (
        <div className={classes.shareQrWrapper}>
          <Image
            src={qrCodeDataUrl}
            alt={t("WeChat share QR code")}
            w={176}
            h={176}
          />
        </div>
      ) : (
        <Text size="xs" c="dimmed">
          {t("QR code is unavailable right now. You can still copy the link.")}
        </Text>
      )}
    </section>
  );
}
