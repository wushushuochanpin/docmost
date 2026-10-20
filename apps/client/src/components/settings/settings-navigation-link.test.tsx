import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { RouteLoadingBoundary } from "@/components/layouts/global/route-content.tsx";
import { preloadableLazyWithRetry } from "@/lib/lazy-import.ts";
import { SettingsNavigationLink } from "./settings-navigation-link";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const DelayedRoute = preloadableLazyWithRetry(async () => {
  await new Promise((resolve) => setTimeout(resolve, 100));
  return { default: () => <h1>AI settings page</h1> };
});

function CurrentPath() {
  return <output aria-label="Current path">{useLocation().pathname}</output>;
}

describe("SettingsNavigationLink", () => {
  it("loads the destination module before committing navigation", async () => {
    render(
      <MemoryRouter initialEntries={["/settings/api-keys"]}>
        <SettingsNavigationLink
          to="/settings/ai"
          preload={() => DelayedRoute.preload().then(() => undefined)}
        >
          AI settings
        </SettingsNavigationLink>
        <CurrentPath />
        <Routes>
          <Route
            path="/settings/api-keys"
            element={<h1>API management page</h1>}
          />
          <Route
            path="/settings/ai"
            element={
              <RouteLoadingBoundary>
                <DelayedRoute.Component />
              </RouteLoadingBoundary>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("link", { name: "AI settings" }));

    expect(
      screen.getByRole("heading", { name: "API management page" }),
    ).toBeTruthy();
    expect(screen.getByLabelText("Current path").textContent).toBe(
      "/settings/api-keys",
    );
    expect(
      await screen.findByRole("heading", { name: "AI settings page" }),
    ).toBeTruthy();
    expect(screen.getByLabelText("Current path").textContent).toBe(
      "/settings/ai",
    );
    expect(
      screen.queryByRole("heading", { name: "API management page" }),
    ).toBeNull();
  });
});
