import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Link, Outlet } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import App from "./App";

vi.mock("@/lib/config.ts", () => ({
  getShareLegacyRouteMode: () => "observe",
  isBackupEnabled: () => true,
  isCloud: () => false,
}));

vi.mock("@/ee/hooks/use-redirect-to-cloud-select.tsx", () => ({
  useRedirectToCloudSelect: () => undefined,
}));

vi.mock("@/hooks/use-track-origin", () => ({
  useTrackOrigin: () => undefined,
}));

vi.mock("@/components/layouts/global/layout.tsx", () => ({
  default: () => (
    <>
      <nav aria-label="Settings navigation">
        <Link to="/settings/api-keys">API management</Link>
        <Link to="/settings/ai">AI settings</Link>
        <Link to="/settings/audit">Audit log</Link>
      </nav>
      <Outlet />
    </>
  ),
}));

vi.mock(
  "@/features/compliance-admin/api-keys/pages/workspace-api-keys.tsx",
  () => ({ default: () => <h1>API management page</h1> }),
);

vi.mock("@/ee/ai/pages/ai-settings.tsx", async () => {
  await new Promise((resolve) => setTimeout(resolve, 150));
  return { default: () => <h1>AI settings page</h1> };
});

vi.mock("@/features/compliance-admin/audit/pages/audit-logs.tsx", () => ({
  default: () => <h1>Audit log page</h1>,
}));

describe("application navigation", () => {
  it("switches settings content when a sidebar link is clicked", async () => {
    render(
      <MemoryRouter initialEntries={["/settings/api-keys"]}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "API management page" }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("link", { name: "AI settings" }));

    expect(
      await screen.findByRole("heading", { name: "AI settings page" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "API management page" }),
    ).toBeNull();
  });
});
