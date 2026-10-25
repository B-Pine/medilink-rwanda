import { MagnifyingGlass, House } from "@phosphor-icons/react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { renderWithProviders } from "../test/render";
import { CommandPalette } from "./CommandPalette";
import { EmptyState } from "./EmptyState";

const labels = {
  title: "Search or jump to",
  placeholder: "Type a page",
  empty: "Nothing matches",
  hints: "Enter to open",
};

describe("EmptyState", () => {
  it("states what is empty and the next step, accessibly", async () => {
    const { container } = renderWithProviders(
      <EmptyState
        icon={MagnifyingGlass}
        title="No patient found"
        description="Search by phone or ID."
        action={<a href="/register">Register walk-in</a>}
      />,
    );
    expect(screen.getByText("No patient found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Register walk-in" })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("CommandPalette", () => {
  it("moves with the arrow keys and selects with Enter", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWithProviders(
      <CommandPalette
        open
        onOpenChange={() => {}}
        query=""
        onQueryChange={() => {}}
        groups={[
          {
            id: "pages",
            heading: "Go to",
            rows: [
              { id: "today", label: "Today", icon: House },
              { id: "queue", label: "Queue", icon: House },
            ],
          },
        ]}
        onSelect={onSelect}
        labels={labels}
      />,
    );
    const input = screen.getByRole("combobox", { name: "Search or jump to" });
    expect(screen.getByRole("option", { name: "Today" })).toHaveAttribute("aria-selected", "true");
    await user.type(input, "{ArrowDown}");
    const queue = screen.getByRole("option", { name: "Queue" });
    expect(queue).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveAttribute("aria-activedescendant", queue.id);
    await user.type(input, "{ArrowDown}{Enter}");
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "today" }));
  });

  it("shows the empty message when no group has rows", () => {
    renderWithProviders(
      <CommandPalette
        open
        onOpenChange={() => {}}
        query="zzz"
        onQueryChange={() => {}}
        groups={[{ id: "pages", heading: "Go to", rows: [] }]}
        onSelect={() => {}}
        labels={labels}
      />,
    );
    expect(screen.getByText("Nothing matches")).toBeInTheDocument();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });
});
