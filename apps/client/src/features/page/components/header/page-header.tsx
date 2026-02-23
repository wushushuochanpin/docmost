import classes from "./page-header.module.css";
import PageHeaderMenu from "@/features/page/components/header/page-header-menu.tsx";
import { Group } from "@mantine/core";
import Breadcrumb from "@/features/page/components/breadcrumbs/breadcrumb.tsx";

interface Props {
  readOnly?: boolean;
}
export default function PageHeader({ readOnly }: Props) {
  return (
    <div className={classes.header}>
      <Group className={classes.left} wrap="nowrap">
        <Breadcrumb />
      </Group>

      <Group
        justify="flex-end"
        h="100%"
        wrap="nowrap"
        gap="var(--mantine-spacing-xs)"
        className={classes.right}
      >
        <PageHeaderMenu readOnly={readOnly} />
      </Group>
    </div>
  );
}
