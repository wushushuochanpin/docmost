import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { getShareLegacyRouteMode } from "@/lib/config.ts";
import SharedPageSkeleton from "@/features/share/components/shared-page-skeleton.tsx";
import ShareNotFound from "@/features/share/components/share-not-found.tsx";

const SharedPage = lazy(() => import("@/pages/share/shared-page.tsx"));
const ShareLayout = lazy(
  () => import("@/features/share/components/share-layout.tsx"),
);
const ShareRedirect = lazy(() => import("@/pages/share/share-redirect.tsx"));

export default function ShareApp() {
  const shareLegacyRouteMode = getShareLegacyRouteMode();

  return (
    <Suspense fallback={<SharedPageSkeleton fullscreen py={80} />}>
      <Routes>
        <Route element={<ShareLayout />}>
          <Route
            path={"/share/:shareId/p/:pageSlug"}
            element={<SharedPage />}
          />
          {shareLegacyRouteMode !== "removed" && (
            <Route path={"/share/p/:pageSlug"} element={<SharedPage />} />
          )}
        </Route>

        <Route path={"/share/:shareId"} element={<ShareRedirect />} />
        <Route path="*" element={<ShareNotFound />} />
      </Routes>
    </Suspense>
  );
}
