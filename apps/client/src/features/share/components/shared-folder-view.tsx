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
import {
  sharedPageTreeAtom,
  sharedPageTreeRequestStateAtom,
} from "@/features/share/atoms/shared-page-atom.ts";
import classes from "./shared-folder-view.module.css";

interface SharedFolderViewProps {
  pageId: string;
  title: string;
}

export default function SharedFolderView({
  pageId,
  title,
}: SharedFolderViewProps) {
  const { t } = useShareTranslation();
  const { shareId } = useParams();
  const sharedPageTree = useAtomValue(sharedPageTreeAtom);
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

  return (
    <section className={classes.layout}>
      <header>
        <h1 className={classes.title}>{title || t("untitled")}</h1>
        <p className={classes.meta}>
          {t("{{folderCount}} folders · {{fileCount}} files", {
            folderCount,
            fileCount,
          })}
        </p>
      </header>

      <div className={classes.panel}>
        {treeRequestState.status === "error" ? (
          <div className={classes.state}>
            {treeRequestState.errorMessage || t("Failed to load folder items.")}
          </div>
        ) : !sharedPageTree ? (
          <div className={classes.state}>{t("Loading folder items...")}</div>
        ) : subpages.length === 0 ? (
          <div className={classes.state}>{t("No items in this folder.")}</div>
        ) : (
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
        )}
      </div>
    </section>
  );
}
