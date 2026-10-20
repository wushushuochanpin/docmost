import { fireEvent, render, screen } from "@testing-library/react";
import { lazy } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { RouteLoadingBoundary } from "@/components/layouts/global/route-content.tsx";
import { SettingsNavigationLink } from "./settings-navigation-link";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const DelayedPage = lazy(async () => {
  await new Promise((resolve) => setTimeout(resolve, 100));
  return { default: () => <h1>AI settings page</h1> };
});

describe("SettingsNavigationLink", () => {
  it("commits the destination loading state instead of retaining stale content", async () => {
    render(
      <MemoryRouter initialEntries={["/settings/api-keys"]}>
        <SettingsNavigationLink to="/settings/ai">
          AI settings
        </SettingsNavigationLink>
        <Routes>
          <Route
            path="/settings/api-keys"
            element={<h1>API management page</h1>}
          />
          <Route
            path="/settings/ai"
            element={
              <RouteLoadingBoundary>
                <DelayedPage />
              </RouteLoadingBoundary>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("link", { name: "AI settings" }));

    expect(screen.getByRole("status", { name: "Loading..." })).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "API management page" }),
    ).toBeNull();
    expect(
      await screen.findByRole("heading", { name: "AI settings page" }),
    ).toBeTruthy();
  });
});
