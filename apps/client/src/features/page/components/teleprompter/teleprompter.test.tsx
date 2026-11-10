import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Teleprompter, { getLineDurationFactor } from "./teleprompter";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("line reading duration", () => {
  it("gives longer visual lines more time within bounded limits", () => {
    expect(getLineDurationFactor("短句")).toBe(0.5);
    expect(getLineDurationFactor("字".repeat(20))).toBe(1);
    expect(getLineDurationFactor("字".repeat(30))).toBe(1.5);
    expect(getLineDurationFactor("字".repeat(80))).toBe(2);
    expect(getLineDurationFactor("字 ".repeat(20))).toBe(1);
  });
});

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
    Reflect.deleteProperty(HTMLElement.prototype, "offsetHeight");
    Reflect.deleteProperty(HTMLElement.prototype, "offsetTop");
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("slows the continuous scroll for the line at the reading position", () => {
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get: () => 53,
    });
    Object.defineProperty(HTMLElement.prototype, "offsetTop", {
      configurable: true,
      get: () => 0,
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        return { top: this.className.includes("content") ? 190 : 0 } as DOMRect;
      },
    );
    render(<Teleprompter title="" text={"字".repeat(30)} onClose={() => {}} />);
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
    expect(viewport.scrollTop).toBeCloseTo(40 / 1.5 / 10);
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
