import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { renderWithProviders } from "../test/render";
import { ShellSkeleton } from "./ShellSkeleton";
import { Skeleton } from "./Skeleton";

describe("ShellSkeleton (dashboards loading, #262)", () => {
  it("draws the dashboard outline and announces loading, with no axe violations", async () => {
    const { container } = renderWithProviders(<ShellSkeleton />);
    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(10);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("Skeleton height", () => {
  it("lets a height class size it instead of the 1em default", () => {
    const { container } = render(<Skeleton className="h-24" />);
    expect((container.firstChild as HTMLElement).style.height).toBe("");
  });
  it("keeps 1em without a height class, and an explicit height wins", () => {
    const { container, rerender } = render(<Skeleton />);
    expect((container.firstChild as HTMLElement).style.height).toBe("1em");
    rerender(<Skeleton height={40} className="h-24" />);
    expect((container.firstChild as HTMLElement).style.height).toBe("40px");
  });
});
