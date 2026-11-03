import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { renderWithProviders } from "../test/render";
import { Badge } from "./Badge";
import { CHART_SERIES, HeatMap, LoadMeter, SEQUENTIAL_STEPS, TrendChart } from "./Charts";
import { DataTable, type ColumnDef, type DataTableLabels } from "./DataTable";
import { QueueFlagChip, QueueStateBadge } from "./Queue";

/** Remediation R8 (issue #91): UI kit fixes from the S0–S5 audit. */

describe("queue colours (design 02 §4)", () => {
  it("on hold is the violet tint; no response and left are red outlines; completed is slate", () => {
    renderWithProviders(
      <>
        <QueueStateBadge state="on_hold">On hold</QueueStateBadge>
        <QueueStateBadge state="no_response">No response</QueueStateBadge>
        <QueueStateBadge state="left_without_service">Left</QueueStateBadge>
        <QueueStateBadge state="completed">Done</QueueStateBadge>
      </>,
    );
    const badge = (name: string) => screen.getByText(name).parentElement!;
    expect(badge("On hold")).toHaveClass("bg-violet-bg", "text-violet");
    expect(badge("No response")).toHaveClass("bg-surface", "text-danger", "border-current");
    expect(badge("Left")).toHaveClass("bg-surface", "text-danger", "border-current");
    expect(badge("Done")).toHaveClass("bg-subtle", "text-fg-secondary");
  });

  it("priority is violet solid, emergency red solid, no response a red outline", async () => {
    const { container } = renderWithProviders(
      <>
        <QueueFlagChip flag="priority">Priority</QueueFlagChip>
        <QueueFlagChip flag="emergency">Emergency</QueueFlagChip>
        <QueueFlagChip flag="no_response">No response</QueueFlagChip>
      </>,
    );
    expect(screen.getByText("Priority")).toHaveClass("bg-violet-solid", "text-on-violet-solid");
    expect(screen.getByText("Emergency")).toHaveClass("bg-danger-solid", "text-on-danger-solid");
    expect(screen.getByText("No response")).toHaveClass("bg-surface", "text-danger");
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("Badge (design 03 §2)", () => {
  it("wraps in a narrow container instead of overflowing", () => {
    renderWithProviders(
      <div style={{ width: 80 }}>
        <Badge tone="info" variant="outline">
          Ibitaro byemewe n’ubwishingizi bwawe
        </Badge>
      </div>,
    );
    const badge = screen.getByText(/Ibitaro/).parentElement!;
    expect(badge).not.toHaveClass("whitespace-nowrap");
    // breaks between words; a single word longer than the line still breaks, so nothing clips
    expect(badge).toHaveClass("max-w-full", "[overflow-wrap:break-word]");
    expect(badge.querySelector("svg")).toHaveClass("shrink-0");
  });
});

const labels = ["Mon", "Tue", "Wed"];
const six = Array.from({ length: 7 }, (_, i) => ({
  name: `Service ${i + 1}`,
  values: [i, i + 1, null],
}));

describe("TrendChart (design 04 §4)", () => {
  it("draws up to six series in the validated palette order", () => {
    const { container } = renderWithProviders(
      <TrendChart title="Waits" labels={labels} series={six} />,
    );
    const strokes = [...container.querySelectorAll("svg path[fill='none']")].map((p) =>
      p.getAttribute("stroke"),
    );
    expect(strokes).toEqual(CHART_SERIES);
    expect(CHART_SERIES).toHaveLength(6);
    // axis text uses the caption size token
    expect(container.querySelector("svg text")).toHaveClass("text-caption");
  });

  it("shows the readout from the keyboard and announces it", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <TrendChart title="Patients per day" labels={labels} series={six.slice(0, 2)} unit=" min" />,
    );
    const plot = screen.getByRole("slider", { name: "Patients per day" });
    expect(plot).toHaveAttribute("tabindex", "0");
    expect(plot).toHaveAccessibleDescription(/arrow keys/);
    await user.tab();
    expect(plot).toHaveFocus();
    // focus starts on the latest value
    expect(screen.getByTestId("chart-readout")).toHaveTextContent("Wed");
    expect(plot).toHaveAttribute("aria-valuetext", "Wed: Service 1 —, Service 2 —");
    await user.keyboard("{Home}");
    expect(screen.getByTestId("chart-readout")).toHaveTextContent("Mon");
    await user.keyboard("{ArrowRight}");
    expect(plot).toHaveAttribute("aria-valuenow", "1");
    expect(plot).toHaveAttribute("aria-valuetext", "Tue: Service 1 1 min, Service 2 2 min");
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("chart-readout")).not.toBeInTheDocument();
  });

  it("has a visible Show table toggle", async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <TrendChart title="Waits" labels={labels} series={six.slice(0, 1)} />,
    );
    const toggle = screen.getByRole("button", { name: "Show table" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    const region = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(region).toHaveClass("sr-only");
    expect(within(region).getByRole("table", { name: "Data of the chart: Waits" })).toBeTruthy();
    await user.click(toggle);
    expect(screen.getByRole("button", { name: "Hide table" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(region).not.toHaveClass("sr-only");
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("HeatMap and LoadMeter", () => {
  it("uses the 4-step sequential ramp and a table toggle", () => {
    const { container } = renderWithProviders(
      <HeatMap
        title="Arrivals"
        rows={["Mon"]}
        columns={[8, 9, 10, 11, 12]}
        value={(_r, c) => (c - 8) * 25}
        legend={{ less: "Less", more: "More" }}
      />,
    );
    const steps = [...container.querySelectorAll("[data-step]")].map((c) =>
      Number(c.getAttribute("data-step")),
    );
    expect(steps).toEqual([0, 1, 2, 3, 4]);
    expect(Math.max(...steps)).toBe(SEQUENTIAL_STEPS);
    expect(container.innerHTML).not.toContain("--ml-seq-5");
    expect(screen.getByRole("button", { name: "Show table" })).toBeVisible();
  });

  it("LoadMeter shows an icon with its label", () => {
    renderWithProviders(<LoadMeter load="high" label="Busy" value={8} max={10} />);
    const label = screen.getByText("Busy");
    expect(label.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});

interface Row {
  id: string;
  name: string;
  amount: number;
}

const tableLabels: DataTableLabels = {
  search: "Search",
  clearAll: "Clear all",
  removeFilter: "Remove filter",
  results: (n) => `${n} results`,
  rowsPerPage: "Rows per page",
  previous: "Previous",
  next: "Next",
  page: (p, n) => `Page ${p} of ${n}`,
  density: "Density",
  densities: { compact: "Compact", default: "Default", comfortable: "Comfortable" },
  actions: "Actions",
  empty: "Nothing yet.",
  noResults: "No match.",
  error: "Couldn't load.",
  retry: "Try again",
};

describe("DataTable (design 08 §2)", () => {
  it("aligns numbers right, labels card fields from meta and uses a stable search id", () => {
    const columns: ColumnDef<Row, unknown>[] = [
      { accessorKey: "name", header: "Patient" },
      {
        accessorKey: "amount",
        header: () => <span>Amount (RWF)</span>,
        meta: { align: "right", label: "Amount (RWF)" },
      },
    ];
    renderWithProviders(
      <DataTable<Row>
        caption="Bills of today"
        columns={columns}
        data={[{ id: "1", name: "Mukamana Jeanne", amount: 2000 }]}
        getRowId={(r) => r.id}
        labels={tableLabels}
        total={1}
        page={1}
        pageSize={25}
        onPageChange={() => undefined}
        onSearchChange={() => undefined}
      />,
    );
    const search = screen.getByRole("searchbox", { name: "Search" });
    expect(search.id).not.toContain(" ");
    expect(search.id).not.toContain("Bills");
    expect(screen.getByRole("columnheader", { name: "Amount (RWF)" })).toHaveClass(
      "text-right",
      "px-5",
    );
    const cells = screen.getAllByRole("cell");
    expect(cells[1]).toHaveClass("text-right", "tabular-nums", "px-5");
    expect(cells[0]).toHaveClass("px-5");
    // card list (under 640 px) names the column from meta.label
    expect(screen.getByText("Amount (RWF)", { selector: "dt" })).toBeInTheDocument();
  });

  it("gives two tables on one page distinct search ids", () => {
    const columns: ColumnDef<Row, unknown>[] = [{ accessorKey: "name", header: "Name" }];
    const props = {
      caption: "Same",
      columns,
      data: [] as Row[],
      getRowId: (r: Row) => r.id,
      labels: tableLabels,
      total: 0,
      page: 1,
      pageSize: 25,
      onPageChange: () => undefined,
      onSearchChange: () => undefined,
    };
    renderWithProviders(
      <>
        <DataTable<Row> {...props} />
        <DataTable<Row> {...props} />
      </>,
    );
    const [a, b] = screen.getAllByRole("searchbox");
    expect(a!.id).not.toBe(b!.id);
    fireEvent.change(a!, { target: { value: "x" } });
    expect(b).toHaveValue("");
  });
});
