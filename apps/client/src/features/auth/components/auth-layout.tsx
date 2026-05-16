import React from "react";
import { Group } from "@mantine/core";
import classes from "./auth.module.css";

type AuthLayoutProps = {
  children: React.ReactNode;
};

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <>
      <Group justify="center" gap={8} className={classes.logo}>
        <img
          src="/icons/logo.svg"
          alt="SuperChat"
          className={classes.logoImage}
        />
      </Group>
      {children}
    </>
  );
}
