import { Route, Routes } from "react-router-dom";
import { getShareLegacyRouteMode } from "@/lib/config.ts";
import ShareNotFound from "@/features/share/components/share-not-found.tsx";
import SharedPage from "@/pages/share/shared-page.tsx";
import ShareLayout from "@/features/share/components/share-layout.tsx";
import ShareRedirect from "@/pages/share/share-redirect.tsx";

export default function ShareApp() {
  const shareLegacyRouteMode = getShareLegacyRouteMode();

  return (
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
  );
}
