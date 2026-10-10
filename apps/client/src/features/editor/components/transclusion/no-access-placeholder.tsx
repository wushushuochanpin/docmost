import { EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import classes from "./transclusion.module.css";

export default function NoAccessPlaceholder() {
  const { t } = useTranslation();
  return (
    <div className={classes.placeholder}>
      <EyeOff size={18} strokeWidth={1.6} className={classes.placeholderIcon} />
      <span>{t("You don't have access to this synced block")}</span>
    </div>
  );
}
