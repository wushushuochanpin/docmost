import { ThemeIcon } from "@mantine/core";
import React from "react";
import { UsersRound } from "lucide-react";

export function IconGroupCircle() {
  return (
    <ThemeIcon variant="light" size="lg" color="gray" radius="xl">
      <UsersRound strokeWidth={1.5} />
    </ThemeIcon>
  );
}
