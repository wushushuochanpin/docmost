import type { MouseEventHandler } from "react";
import { Link, type LinkProps, useNavigate } from "react-router-dom";

type SettingsNavigationLinkProps = Omit<LinkProps, "onClick"> & {
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  preload?: () => void;
};

export function SettingsNavigationLink({
  onClick,
  preload,
  to,
  ...props
}: SettingsNavigationLinkProps) {
  const navigate = useNavigate();

  const handleClick: MouseEventHandler<HTMLAnchorElement> = (event) => {
    onClick?.(event);
    if (event.defaultPrevented) return;

    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    preload?.();
    navigate(to, { flushSync: true });
  };

  return <Link {...props} to={to} onClick={handleClick} />;
}
