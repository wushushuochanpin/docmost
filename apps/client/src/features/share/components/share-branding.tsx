import classes from "./share-branding.module.css";

export default function ShareBranding() {
  return (
    <div className={classes.branding}>
      <a
        className={classes.brandingLink}
        target="_blank"
        rel="noreferrer"
        href="https://docmost.com?ref=public-share"
      >
        Powered by SuperChat
      </a>
    </div>
  );
}
