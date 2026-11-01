import { act, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { useWakeLock } from "../hooks/useWakeLock";
import { renderWithProviders } from "../test/render";
import { CountBadge, formatCount } from "./CountBadge";
import { SwitchField } from "./Switch";

/** S9-F12: CountBadge, Switch and useWakeLock. */

describe("CountBadge", () => {
  it("shows the count, caps at 99+, hides at 0, and is aria-hidden", async () => {
    const { container, rerender } = renderWithProviders(
      <button type="button" aria-label="Notifications, 3 unread">
        <CountBadge count={3} />
      </button>,
    );
    const badge = screen.getByTestId("count-badge");
    expect(badge).toHaveTextContent("3");
    expect(badge).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("button", { name: "Notifications, 3 unread" })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    rerender(
      <button type="button" aria-label="Notifications, 120 unread">
        <CountBadge count={120} />
      </button>,
    );
    expect(screen.getByTestId("count-badge")).toHaveTextContent("99+");
    rerender(
      <button type="button" aria-label="Notifications">
        <CountBadge count={0} />
      </button>,
    );
    expect(screen.queryByTestId("count-badge")).not.toBeInTheDocument();
  });

  it("formats with a custom maximum", () => {
    expect(formatCount(5)).toBe("5");
    expect(formatCount(100)).toBe("99+");
    expect(formatCount(10, 9)).toBe("9+");
  });
});

describe("Switch (S9 use: quiet hours, dependents)", () => {
  function Harness() {
    const [on, setOn] = useState(true);
    return (
      <SwitchField
        label="Quiet hours"
        hint="No push or email at night"
        checked={on}
        onCheckedChange={setOn}
        stateLabel={on ? "On" : "Off"}
      />
    );
  }

  it("is a labelled role=switch that toggles with Space, state in text, axe clean", async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<Harness />);
    const control = screen.getByRole("switch", { name: "Quiet hours" });
    expect(control).toHaveAttribute("aria-checked", "true");
    expect(control).toHaveAccessibleDescription("No push or email at night");
    control.focus();
    await user.keyboard(" ");
    expect(control).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("Off")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("useWakeLock", () => {
  const original = Object.getOwnPropertyDescriptor(navigator, "wakeLock");
  afterEach(() => {
    if (original) Object.defineProperty(navigator, "wakeLock", original);
    else delete (navigator as { wakeLock?: unknown }).wakeLock;
  });

  function fakeWakeLock() {
    const sentinels: { released: boolean; release: () => Promise<void> }[] = [];
    const request = vi.fn(() => {
      const sentinel = {
        released: false,
        release: vi.fn(() => {
          sentinel.released = true;
          return Promise.resolve();
        }),
      };
      sentinels.push(sentinel);
      return Promise.resolve(sentinel);
    });
    Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });
    return { request, sentinels };
  }

  it("reports unsupported browsers and does nothing", () => {
    delete (navigator as { wakeLock?: unknown }).wakeLock;
    const { result } = renderHook(() => useWakeLock(true));
    expect(result.current).toEqual({ supported: false, active: false });
  });

  it("acquires while enabled, re-acquires on visibilitychange, releases on unmount", async () => {
    const { request, sentinels } = fakeWakeLock();
    const { result, unmount, rerender } = renderHook(({ on }) => useWakeLock(on), {
      initialProps: { on: false },
    });
    expect(result.current).toEqual({ supported: true, active: false });
    expect(request).not.toHaveBeenCalled();

    rerender({ on: true });
    await vi.waitFor(() => expect(result.current.active).toBe(true));
    expect(request).toHaveBeenCalledWith("screen");

    // The browser releases the lock when the page is hidden; coming back re-acquires it.
    sentinels[0]!.released = true;
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));

    unmount();
    expect(sentinels[1]!.release).toHaveBeenCalled();
  });

  it("stays inactive when the request is refused", async () => {
    Object.defineProperty(navigator, "wakeLock", {
      value: { request: vi.fn(() => Promise.reject(new Error("NotAllowedError"))) },
      configurable: true,
    });
    const { result } = renderHook(() => useWakeLock(true));
    await act(() => Promise.resolve());
    expect(result.current).toEqual({ supported: true, active: false });
  });
});
