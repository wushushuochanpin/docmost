import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import ShareShell from "@/features/share/components/share-shell.tsx";
import SharedPageSkeleton from "@/features/share/components/shared-page-skeleton.tsx";

export default function ShareLayout() {
  return (
    <ShareShell>
      <Suspense fallback={<SharedPageSkeleton />}>
        <Outlet />
      </Suspense>
    </ShareShell>
  );
}
