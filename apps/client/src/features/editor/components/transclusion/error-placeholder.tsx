import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import classes from "./transclusion.module.css";

export default function ErrorPlaceholder() {
  const { t } = useTranslation();
  return (
    <div className={classes.placeholder}>
      <AlertTriangle
        size={18}
        strokeWidth={1.6}
        className={classes.placeholderIcon}
      />
      <span>{t("Failed to load this synced block")}</span>
    </div>
  );
}
