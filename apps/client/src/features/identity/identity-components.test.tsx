import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { IdentityLogin } from "./identity-login";
import { IdentityAccountSection } from "./identity-account";
import {
  getIdentityAccount,
  getIdentityStatus,
  startIdentityLink,
} from "./identity-service";

vi.mock("./identity-service", () => ({
  getIdentityAccount: vi.fn(),
  getIdentityStatus: vi.fn(),
  startIdentityLink: vi.fn(),
}));
vi.mock("./identity-bootstrap", () => ({
  beginIdentityLogin: vi.fn(),
  IdentityBrowserUnsupportedError: class extends Error {},
}));
import { beginIdentityLogin } from "./identity-bootstrap";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function mount(node: React.ReactNode, path = "/login") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MantineProvider>
        <MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>
      </MantineProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/login");
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi
      .fn()
      .mockImplementation(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
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

describe("identity login", () => {
  it("does not expose or start identity login when disabled", async () => {
    vi.mocked(getIdentityStatus).mockResolvedValue({ enabled: false });
    mount(<IdentityLogin />);
    await waitFor(() => expect(getIdentityStatus).toHaveBeenCalledOnce());
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("renders an explicit same-origin login action and a safe return destination", async () => {
    vi.mocked(getIdentityStatus).mockResolvedValue({ enabled: true });
    mount(<IdentityLogin />, "/login?logout=1");
    const button = await screen.findByRole("button", {
      name: "Sign in with Xianzhi Identity Center",
    });
    expect(beginIdentityLogin).not.toHaveBeenCalled();
    fireEvent.click(button);
    await waitFor(() => expect(beginIdentityLogin).toHaveBeenCalledOnce());
    expect(startIdentityLink).not.toHaveBeenCalled();
  });
  it("explains unbound callback failure without rendering provider input", async () => {
    vi.mocked(getIdentityStatus).mockResolvedValue({ enabled: true });
    mount(<IdentityLogin />, "/login?identity_error=identity_not_linked");
    expect((await screen.findByRole("alert")).textContent).toContain(
      "first accept an invitation",
    );
  });
});

describe("identity account binding", () => {
  it("requires a local password, clears it on rejection and supports retry", async () => {
    vi.mocked(getIdentityAccount).mockResolvedValue({
      enabled: true,
      linked: false,
    });
    vi.mocked(startIdentityLink).mockRejectedValue({
      response: { status: 401, data: { message: "identity_password_invalid" } },
    });
    mount(<IdentityAccountSection />, "/settings/account/profile");
    fireEvent.click(
      await screen.findByRole("button", { name: "Link account" }),
    );
    const password = screen.getByLabelText("Current password", {
      exact: false,
    }) as HTMLInputElement;
    const submit = screen.getByRole("button", {
      name: "Verify and continue",
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(password, { target: { value: "local-password" } });
    fireEvent.click(submit);
    await waitFor(() =>
      expect(startIdentityLink).toHaveBeenCalledWith("local-password"),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "could not be verified",
    );
    expect(password.value).toBe("");
    fireEvent.change(password, { target: { value: "retry-password" } });
    fireEvent.click(submit);
    await waitFor(() => expect(startIdentityLink).toHaveBeenCalledTimes(2));
  });
  it("cancels local input without creating a center transaction", async () => {
    vi.mocked(getIdentityAccount).mockResolvedValue({
      enabled: true,
      linked: false,
    });
    mount(<IdentityAccountSection />, "/settings/account/profile");
    fireEvent.click(
      await screen.findByRole("button", { name: "Link account" }),
    );
    fireEvent.change(
      screen.getByLabelText("Current password", { exact: false }),
      { target: { value: "private" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByLabelText("Current password", { exact: false }),
    ).toBeNull();
    expect(startIdentityLink).not.toHaveBeenCalled();
  });
  it("only shows success after the server confirms binding and offers no unlink", async () => {
    vi.mocked(getIdentityAccount).mockResolvedValue({
      enabled: true,
      linked: true,
    });
    mount(
      <IdentityAccountSection />,
      "/settings/account/profile?identity_linked=1",
    );
    expect((await screen.findByRole("status")).textContent).toBe(
      "Account linked successfully.",
    );
    expect(screen.queryByRole("button", { name: "Link account" })).toBeNull();
  });
});
