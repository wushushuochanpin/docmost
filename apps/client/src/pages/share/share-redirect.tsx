import { useNavigate, useParams } from "react-router-dom";
import { useEffect } from "react";
import { buildSharedPageUrl } from "@/features/page/page.utils.ts";
import SharedPageSkeleton from "@/features/share/components/shared-page-skeleton.tsx";
import { getShareInfo } from "@/features/share/services/share-service.ts";
import { useShareAsyncResource } from "@/features/share/hooks/use-share-async-resource.ts";
import ShareNotFound from "@/features/share/components/share-not-found.tsx";

export default function ShareRedirect() {
  const { shareId } = useParams();
  const navigate = useNavigate();

  const { data: share, isLoading, isError } = useShareAsyncResource(
    shareId ? () => getShareInfo(shareId, undefined, true) : null,
    [shareId],
    { enabled: Boolean(shareId) },
  );

  useEffect(() => {
    if (share) {
      navigate(
        buildSharedPageUrl({
          shareId: share.key,
          pageSlugId: share?.sharedPage.slugId,
          pageTitle: share?.sharedPage.title,
        }),
        { replace: true },
      );
    }
  }, [navigate, share]);

  if (isError) {
    return <ShareNotFound />;
  }

  if (isLoading) {
    return <SharedPageSkeleton fullscreen py={80} />;
  }

  return null;
}
