import "@mantine/core/styles.css";

import { MantineProvider } from "@mantine/core";
import { mantineCssResolver, theme } from "@/theme";

export function ShareMantineBoundary({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MantineProvider
      theme={theme}
      cssVariablesResolver={mantineCssResolver}
      defaultColorScheme="light"
    >
      {children}
    </MantineProvider>
  );
}
