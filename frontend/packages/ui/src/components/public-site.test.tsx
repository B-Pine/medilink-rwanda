import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { renderWithProviders } from "../test/render";
import { Accordion } from "./Accordion";
import { GroupedList, GroupedRow } from "./GroupedList";
import { Lightbox } from "./Lightbox";
import { SegmentedControl } from "./SegmentedControl";
import { Select } from "./Select";
import { Sheet } from "./Sheet";
import { StatusPill } from "./StatusPill";

/** Public site system (audit 2026-11-07, phase 2): the shared components, keyboard and axe. */

const DISTRICTS = [
  { value: "", label: "All of Rwanda" },
  { value: "gasabo", label: "Gasabo" },
  { value: "huye", label: "Huye" },
  { value: "kicukiro", label: "Kicukiro" },
];

function DistrictSelect() {
  const [value, setValue] = useState("");
  return (
    <>
      <Select label="Where" value={value} onChange={setValue} options={DISTRICTS} />
      <output>{value || "none"}</output>
    </>
  );
}

describe("Select", () => {
  it("opens a listbox, moves with the keys, types ahead, picks and gives focus back", async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<DistrictSelect />);
    const button = screen.getByRole("button", { name: /Where/ });
    expect(button).toHaveAttribute("aria-haspopup", "listbox");
    expect(await axe(container)).toHaveNoViolations();

    button.focus();
    await user.keyboard("{ArrowDown}");
    const list = screen.getByRole("listbox", { name: "Where" });
    expect(list).toHaveFocus();
    expect(await axe(container)).toHaveNoViolations();
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(screen.getByText("huye")).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(button).toHaveFocus();

    await user.keyboard("{Enter}k{Enter}");
    expect(screen.getByText("kicukiro")).toBeInTheDocument();

    await user.keyboard("{Enter}{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it("picks with the pointer and closes when clicking away", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DistrictSelect />);
    await user.click(screen.getByRole("button", { name: /Where/ }));
    await user.click(screen.getByRole("option", { name: "Gasabo" }));
    expect(screen.getByText("gasabo")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Where/ }));
    expect(screen.getByRole("option", { name: "Gasabo" })).toHaveAttribute("aria-selected", "true");
    await user.click(document.body);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});

describe("SegmentedControl", () => {
  it("is a radio group with one tab stop; arrows move and select", async () => {
    const user = userEvent.setup();
    function View() {
      const [view, setView] = useState<"list" | "map">("list");
      return (
        <SegmentedControl
          label="View"
          value={view}
          onChange={setView}
          options={[
            { value: "list", label: "List" },
            { value: "map", label: "Map" },
          ]}
        />
      );
    }
    const { container } = renderWithProviders(<View />);
    const list = screen.getByRole("radio", { name: "List" });
    expect(list).toBeChecked();
    expect(screen.getByRole("radio", { name: "Map" })).toHaveAttribute("tabindex", "-1");
    list.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Map" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Map" })).toHaveFocus();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("Accordion", () => {
  it("shows the first answer open and the rest closed", async () => {
    const { container } = renderWithProviders(
      <Accordion
        items={[
          { id: "a", title: "Do I need an account?", content: "No, not to look." },
          { id: "b", title: "Is it free?", content: "Yes." },
        ]}
      />,
    );
    expect(screen.getByRole("heading", { level: 3, name: "Do I need an account?" })).toBeVisible();
    expect(screen.getByText("No, not to look.")).toBeVisible();
    expect(screen.getByText("Yes.")).not.toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("StatusPill and GroupedList", () => {
  it("always carries a word; rows are list items", async () => {
    const { container } = renderWithProviders(
      <GroupedList label="Today" aria-label="Today">
        <GroupedRow
          title="General consultation"
          trailing={<StatusPill tone="open">Open</StatusPill>}
        />
        <GroupedRow title="Dental care" trailing={<StatusPill tone="closed">Closed</StatusPill>} />
      </GroupedList>,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("Sheet and Lightbox", () => {
  it("the sheet traps focus and closes with Escape", async () => {
    const user = userEvent.setup();
    function Filters() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Filters
          </button>
          <Sheet open={open} onOpenChange={setOpen} title="Filters" closeLabel="Close">
            <p>Open now</p>
          </Sheet>
        </>
      );
    }
    renderWithProviders(<Filters />);
    await user.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByRole("dialog", { name: "Filters" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filters" })).toHaveFocus();
  });

  it("the lightbox steps with the arrows and names the photo", async () => {
    const user = userEvent.setup();
    function Photos() {
      const [index, setIndex] = useState<number | null>(0);
      return (
        <Lightbox
          images={[
            { src: "/a.webp", alt: "Clinic, photo 1 of 2" },
            { src: "/b.webp", alt: "Clinic, photo 2 of 2" },
          ]}
          index={index}
          onIndexChange={setIndex}
          labels={{ close: "Close", previous: "Previous photo", next: "Next photo" }}
        />
      );
    }
    renderWithProviders(<Photos />);
    expect(screen.getByRole("dialog", { name: "Clinic, photo 1 of 2" })).toBeInTheDocument();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("img", { name: "Clinic, photo 2 of 2" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next photo" }));
    expect(screen.getByRole("img", { name: "Clinic, photo 1 of 2" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
