import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Teleprompter from "./teleprompter";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("Teleprompter", () => {
  let frames: Map<number, FrameRequestCallback>;
  let nextFrame: number;
  beforeEach(() => {
    frames = new Map();
    nextFrame = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const id = ++nextFrame;
      frames.set(id, callback);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      measureText: (value: string) => ({ width: value.length * 20 }),
    } as unknown as CanvasRenderingContext2D);
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get: () => 600,
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get: () => 400,
    });
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get: () => 2000,
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("scrolls, pauses, changes speed and exits", () => {
    const close = vi.fn();
    render(
      <Teleprompter
        title="Title"
        text={"First line\n\n  \nSecond line"}
        onClose={close}
      />,
    );
    const viewport = document.querySelector(
      '[class*="viewport"]',
    ) as HTMLElement;
    const tick = (time: number) => {
      const entry = frames.entries().next().value;
      if (entry) {
        frames.delete(entry[0]);
        act(() => entry[1](time));
      }
    };
    tick(100);
    tick(200);
    expect(viewport.scrollTop).toBe(4);
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
    expect(document.querySelectorAll('[class*="line"]')).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Increase speed" }));
    expect(screen.getByText("50")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Decrease speed" }));
    expect(screen.getByText("40")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
    viewport.scrollTop = 200;
    fireEvent.click(
      screen.getByRole("button", { name: "Play from beginning" }),
    );
    expect(viewport.scrollTop).toBe(0);
    tick(300);
    tick(400);
    expect(viewport.scrollTop).toBe(4);
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Play from beginning" }),
    );
    expect(viewport.scrollTop).toBe(0);
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(close).toHaveBeenCalledOnce();
  });
});
