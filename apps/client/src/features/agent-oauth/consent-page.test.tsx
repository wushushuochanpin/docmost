import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter } from "react-router-dom";
import ConsentPage from "./consent-page";
import api from "@/lib/api-client";
import { openCallback } from "./callback-navigation";

vi.mock("@/lib/api-client", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));
vi.mock("./callback-navigation", () => ({ openCallback: vi.fn() }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (s: string) => s }),
}));

const callback =
  "workbuddy://workbuddy/mcp/custom-mcp%3Adocmost/oauth/callback?code=example&state=state";
const consent = {
  application: "WorkBuddy Connector",
  redirect_origin: "workbuddy://workbuddy",
  scopes: ["knowledge.read"],
  requested_scopes: ["knowledge.read"],
  supported_scopes: ["knowledge.read"],
  spaces: [{ id: "space-1", name: "General" }],
  csrf_token: "csrf",
  max_grant_days: 30,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.get).mockResolvedValue({ data: consent });
  vi.mocked(api.post).mockResolvedValue({ data: { redirect_url: callback } });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mount() {
  return render(
    <MantineProvider>
      <MemoryRouter
        initialEntries={[
          "/oauth/consent?request_id=019a0000-1111-7111-8111-111111111111",
        ]}
      >
        <ConsentPage />
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe("OAuth consent handoff", () => {
  it("shows a completed state after a desktop handoff and allows reopening", async () => {
    mount();
    fireEvent.click(await screen.findByLabelText("General"));
    fireEvent.click(screen.getByRole("button", { name: "允许连接" }));
    expect(
      await screen.findByRole("heading", { name: "授权已提交" }),
    ).toBeTruthy();
    expect(openCallback).toHaveBeenCalledWith(callback);
    expect(screen.queryByRole("button", { name: "允许连接" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "返回应用" }));
    expect(openCallback).toHaveBeenCalledTimes(2);
  });

  it("shows rejection after denying without requiring a space", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "拒绝" }));
    expect(
      await screen.findByRole("heading", { name: "已拒绝授权" }),
    ).toBeTruthy();
    expect(openCallback).toHaveBeenCalledWith(callback);
  });

  it("does not navigate when the callback origin does not match", async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: { redirect_url: "https://example.com/callback" },
    });
    mount();
    fireEvent.click(await screen.findByLabelText("General"));
    fireEvent.click(screen.getByRole("button", { name: "允许连接" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(openCallback).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "允许连接" }).hasAttribute("disabled"),
    ).toBe(false);
  });
});
