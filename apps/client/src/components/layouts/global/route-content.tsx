import { Suspense } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation } from "react-router-dom";

export function RouteLoadingFallback({
  fullPage = false,
}: {
  fullPage?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div
      role="status"
      aria-label={t("Loading...")}
      style={{
        alignItems: "center",
        display: "flex",
        justifyContent: "center",
        minHeight: fullPage ? "100vh" : 160,
      }}
    >
      <span>{t("Loading...")}</span>
    </div>
  );
}

export function RouteContent() {
  const location = useLocation();

  return (
    <Suspense key={location.pathname} fallback={<RouteLoadingFallback />}>
      <Outlet />
    </Suspense>
  );
}
