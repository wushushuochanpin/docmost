import React from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { ActionIcon, BoxProps, ElementProps, MantineColor, MantineSize } from "@mantine/core";

export interface SidebarToggleProps extends BoxProps, ElementProps<"button"> {
  size?: MantineSize | `compact-${MantineSize}` | (string & {});
  color?: MantineColor;
  opened?: boolean;
}

const SidebarToggle = React.forwardRef<HTMLButtonElement, SidebarToggleProps>(
  ({ opened, size = "sm", ...others }, ref) => {
    return (
      <ActionIcon
        size={size}
        aria-expanded={opened}
        {...others}
        variant="subtle"
        color="gray"
        ref={ref}
      >
        {opened ? (
          <PanelRightOpen />
        ) : (
          <PanelRightClose />
        )}
      </ActionIcon>
    );
  }
);

export default SidebarToggle;
