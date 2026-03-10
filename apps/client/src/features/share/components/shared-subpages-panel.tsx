import { useParams } from "react-router-dom";
import { useMemo } from "react";
import { useAtomValue } from "jotai";
import {
  IconChevronRight,
  IconFileText,
  IconFolder,
} from "@tabler/icons-react";
import { buildSharedPageUrl } from "@/features/page/page.utils.ts";
import { useShareTranslation } from "@/features/share/share-translations.ts";
import { useSharedPageSubpages } from "@/features/share/hooks/use-shared-page-subpages.ts";
import { sharedPageTreeRequestStateAtom } from "@/features/share/atoms/shared-page-atom.ts";
import classes from "./shared-subpages-panel.module.css";

interface SharedSubpagesPanelProps {
  pageId: string;
}

export default function SharedSubpagesPanel({
  pageId,
}: SharedSubpagesPanelProps) {
  const { t } = useShareTranslation();
  const { shareId } = useParams();
  const treeRequestState = useAtomValue(sharedPageTreeRequestStateAtom);
  const subpages = useSharedPageSubpages(pageId);

  const { folderCount, fileCount } = useMemo(
    () =>
      subpages.reduce(
        (acc, item) => {
          if (item.nodeType === "folder") {
            acc.folderCount += 1;
          } else {
            acc.fileCount += 1;
          }
          return acc;
        },
        { folderCount: 0, fileCount: 0 },
      ),
    [subpages],
  );

  if (treeRequestState.status === "error") {
    return (
      <section className={classes.root}>
        <div className={classes.panel}>
          <div className={classes.state}>
            {treeRequestState.errorMessage || t("Failed to load subpages.")}
          </div>
        </div>
      </section>
    );
  }

  if (subpages.length === 0) {
    return null;
  }

  return (
    <section className={classes.root}>
      <header className={classes.header}>
        <h2 className={classes.title}>{t("Subpages")}</h2>
        <p className={classes.meta}>
          {t("{{folderCount}} folders · {{fileCount}} files", {
            folderCount,
            fileCount,
          })}
        </p>
      </header>

      <div className={classes.panel}>
        <div className={classes.list}>
          {subpages.map((item) => {
            const href = buildSharedPageUrl({
              shareId: shareId ?? "",
              pageSlugId: item.slugId,
              pageTitle: item.name,
            });
            return (
              <a key={item.value} className={classes.item} href={href}>
                <div className={classes.itemMain}>
                  <span className={classes.itemIcon} aria-hidden="true">
                    {item.icon ? (
                      item.icon
                    ) : item.nodeType === "folder" ? (
                      <IconFolder size={16} stroke={1.75} />
                    ) : (
                      <IconFileText size={16} stroke={1.75} />
                    )}
                  </span>
                  <span className={classes.itemTitle}>
                    {item.name || t("untitled")}
                  </span>
                </div>

                <span className={classes.itemMeta} aria-hidden="true">
                  <IconChevronRight size={16} stroke={1.75} />
                </span>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
