import { fireEvent, render, screen } from "@testing-library/react";
import { lazy } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { RouteLoadingBoundary } from "@/components/layouts/global/route-content.tsx";
import { SettingsNavigationLink } from "./settings-navigation-link";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const delayedModule = new Promise<{ default: () => JSX.Element }>((resolve) => {
  setTimeout(() => resolve({ default: () => <h1>AI settings page</h1> }), 100);
});
const DelayedPage = lazy(() => delayedModule);

describe("SettingsNavigationLink", () => {
  it("loads the destination module before committing navigation", async () => {
    render(
      <MemoryRouter initialEntries={["/settings/api-keys"]}>
        <SettingsNavigationLink
          to="/settings/ai"
          preload={() => delayedModule.then(() => undefined)}
        >
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

    expect(
      screen.getByRole("heading", { name: "API management page" }),
    ).toBeTruthy();
    expect(
      await screen.findByRole("heading", { name: "AI settings page" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "API management page" }),
    ).toBeNull();
  });
});
