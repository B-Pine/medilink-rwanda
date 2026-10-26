import { MagnifyingGlass, House } from "@phosphor-icons/react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { renderWithProviders } from "../test/render";
import { CommandPalette } from "./CommandPalette";
import { EmptyState } from "./EmptyState";
import { formatRwf, MoneyField, TimeRangeField } from "./SetupFields";
import { WeekGrid } from "./WeekGrid";

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

describe("S2 components", () => {
  const labels = {
    caption: "Week of Keza",
    gridView: "Week",
    tableView: "List",
    day: "Day",
    time: "Time",
    session: "Session",
    actions: "Actions",
    add: (day: string) => `Add session on ${day}`,
    edit: "Edit",
    empty: "No session",
  };
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  it("WeekGrid: blocks are buttons named by day and time; the table offers the same actions", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onAdd = vi.fn();
    const { container } = renderWithProviders(
      <WeekGrid
        blocks={[{ id: "a", weekday: 0, start: "08:00", end: "12:00", title: "General" }]}
        dayLabels={days}
        labels={labels}
        onSelect={onSelect}
        onAdd={onAdd}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Monday, 08:00–12:00, General" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(await axe(container)).toHaveNoViolations();
    await user.click(screen.getByRole("button", { name: "List" }));
    await user.click(screen.getByRole("button", { name: "Edit: Monday, 08:00–12:00, General" }));
    await user.click(screen.getByRole("button", { name: "Add session on Tuesday" }));
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onAdd).toHaveBeenCalledWith(1);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("TimeRangeField flags a reversed range; MoneyField groups whole francs", async () => {
    const user = userEvent.setup();
    const onMoney = vi.fn();
    const { container } = renderWithProviders(
      <>
        <TimeRangeField
          label="Monday"
          start="17:00"
          end="08:00"
          onChange={() => {}}
          labels={{ start: "Opens", end: "Closes", order: "The end must be after the start." }}
        />
        <MoneyField label="Price" value={12500} onChange={onMoney} />
      </>,
    );
    expect(screen.getByText("The end must be after the start.")).toBeInTheDocument();
    expect(screen.getByLabelText("Opens")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Price")).toHaveValue("12,500");
    await user.type(screen.getByLabelText("Price"), "a");
    expect(onMoney).toHaveBeenLastCalledWith(12500);
    expect(formatRwf(5000)).toBe("5,000 RWF");
    expect(await axe(container)).toHaveNoViolations();
  });
});
