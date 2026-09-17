import { useAtom } from "jotai";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import { IconClock, IconFileDescription } from "@tabler/icons-react";

import { recentVisitsAtom } from "@/features/page/tree/atoms/recent-visits-atom";
import { buildPageUrl } from "@/features/page/page.utils";
import classes from "./recent-visits-rail.module.css";

const MAX_VISIBLE = 8;

/**
 * Bottom-of-sidebar rail of recently opened pages for the current space.
 * Purely client-side (localStorage-backed atom) — no backend involved.
 */
export function RecentVisitsRail({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation();
  const { spaceSlug } = useParams();
  const [visits] = useAtom(recentVisitsAtom);

  const spaceVisits = useMemo(
    () => visits.filter((v) => v.spaceId === spaceId).slice(0, MAX_VISIBLE),
    [visits, spaceId],
  );

  if (spaceVisits.length === 0) return null;

  return (
    <div className={classes.rail}>
      <div className={classes.header}>
        <IconClock size={13} stroke={1.8} className={classes.headerIcon} />
        <span className={classes.headerText}>{t("Recent visits")}</span>
      </div>
      <div className={classes.chips}>
        {spaceVisits.map((visit) => {
          const pageUrl = buildPageUrl(spaceSlug, visit.slugId, visit.name);
          const title = visit.name || t("untitled");
          return (
            <Link key={visit.id} to={pageUrl} className={classes.chip} title={title}>
              {visit.icon ? (
                <span className={classes.chipIcon}>{visit.icon}</span>
              ) : (
                <IconFileDescription size={13} className={classes.chipIcon} />
              )}
              <span className={classes.chipLabel}>{title}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
