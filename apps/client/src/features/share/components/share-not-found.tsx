import { Link } from "react-router-dom";
import { useShareDocumentTitle } from "@/features/share/hooks/use-share-document-title.ts";
import { useShareTranslation } from "@/features/share/share-translations.ts";
import classes from "./share-page-state.module.css";

export default function ShareNotFound() {
  const { t } = useShareTranslation();
  useShareDocumentTitle(`${t("404 page not found")} - SuperChat`);

  return (
    <div className={classes.centeredViewport}>
      <section className={classes.statePanel}>
        <h1 className={classes.stateTitle}>{t("404 page not found")}</h1>
        <p className={classes.stateDescription}>
          {t("Sorry, we can't find the page you are looking for.")}
        </p>
        <div className={classes.stateActions}>
          <Link className={classes.secondaryButton} to="/home">
            {t("Take me back to homepage")}
          </Link>
        </div>
      </section>
    </div>
  );
}
