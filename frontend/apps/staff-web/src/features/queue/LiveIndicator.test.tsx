import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppProviders, createServices } from "../../app/services";
import { LiveBadge } from "./LiveIndicator";
import { liveStore } from "./live";

/** Design 04 §5: yellow "Reconnecting" once data is older than 30 s; announce state changes only. */

function renderBadge(announce = true) {
  const services = createServices({ language: "en", persistLanguage: false });
  return render(
    <AppProviders services={services}>
      <LiveBadge announce={announce} />
    </AppProviders>,
  );
}

describe("LiveBadge", () => {
  afterEach(() => {
    vi.useRealTimers();
    liveStore.setStatus("connecting");
    liveStore.setPending(0);
  });

  it("turns yellow after 30 s without fresh data, even while the socket is open", () => {
    vi.useFakeTimers();
    liveStore.setStatus("live");
    liveStore.touched();
    const { container } = renderBadge();
    const chip = () => container.querySelector("[data-state]")!;
    expect(chip()).toHaveAttribute("data-state", "live");
    expect(chip()).toHaveTextContent("Live · 0 s ago");
    expect(chip()).toHaveClass("bg-success-bg");

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(chip()).toHaveAttribute("data-state", "live");

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(chip()).toHaveAttribute("data-state", "stale");
    expect(chip()).toHaveTextContent("Reconnecting");
    expect(chip()).toHaveClass("bg-warning-bg", "text-warning");

    // a pong or a fetch makes it fresh again
    act(() => {
      liveStore.touched();
    });
    expect(chip()).toHaveAttribute("data-state", "live");
  });

  it("announces state changes only, never the ticking seconds", () => {
    vi.useFakeTimers();
    liveStore.setStatus("live");
    liveStore.touched();
    const { container } = renderBadge();
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/^Live$/);
    // the visible chip is not a live region
    expect(container.querySelector("[data-state]")).not.toHaveAttribute("role");
    expect(container.querySelector("[data-state]")).not.toHaveAttribute("aria-live");

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(container.querySelector("[data-state]")).toHaveTextContent("10 s ago");
    expect(status).toHaveTextContent(/^Live$/);

    act(() => {
      liveStore.setStatus("offline");
      liveStore.setPending(2);
    });
    expect(status).toHaveTextContent("Offline · 2 actions waiting");
  });

  it("page badges stay silent so the header badge is the one announcer", () => {
    renderBadge(false);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
