import { fireEvent, render, screen } from "@testing-library/react";
import { lazy } from "react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { RouteContent } from "./route-content";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const DelayedPage = lazy(async () => {
  await new Promise((resolve) => setTimeout(resolve, 100));
  return { default: () => <h1>AI settings page</h1> };
});

function TestShell() {
  return (
    <>
      <nav aria-label="Settings navigation">
        <Link to="/settings/api-keys">API management</Link>
        <Link to="/settings/ai">AI settings</Link>
      </nav>
      <RouteContent />
    </>
  );
}

describe("RouteContent", () => {
  it("keeps navigation interactive while a lazy settings page loads", async () => {
    render(
      <MemoryRouter initialEntries={["/settings/api-keys"]}>
        <Routes>
          <Route element={<TestShell />}>
            <Route
              path="/settings/api-keys"
              element={<h1>API management page</h1>}
            />
            <Route path="/settings/ai" element={<DelayedPage />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("link", { name: "AI settings" }));

    expect(
      screen.getByRole("navigation", { name: "Settings navigation" }),
    ).toBeTruthy();
    expect(screen.getByRole("status", { name: "Loading..." })).toBeTruthy();
    expect(
      await screen.findByRole("heading", { name: "AI settings page" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "API management page" }),
    ).toBeNull();
  });
});
