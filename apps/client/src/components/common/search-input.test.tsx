import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SearchInput } from "./search-input";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
});

describe("SearchInput", () => {
  it("searches on value changes, not when the parent supplies a new callback", async () => {
    const search = vi.fn();
    const view = (onSearch: (value: string) => void) => (
      <MantineProvider>
        <SearchInput onSearch={onSearch} debounceDelay={1} />
      </MantineProvider>
    );
    const { rerender } = render(view((value) => search(value)));
    expect(search).toHaveBeenCalledTimes(1);

    rerender(view((value) => search(value)));
    expect(search).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "AI" } });
    await waitFor(() => expect(search).toHaveBeenLastCalledWith("AI"));
    expect(search).toHaveBeenCalledTimes(2);
  });
});
