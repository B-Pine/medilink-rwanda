import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { renderWithProviders } from "../test/render";
import { DataTable, type ColumnDef, type DataTableLabels, type SortingState } from "./DataTable";
import { ConfirmDialog, Dialog } from "./Dialog";
import { DocumentViewer } from "./DocumentViewer";
import { FileUpload, type FileUploadLabels } from "./FileUpload";
import { SidePanel } from "./SidePanel";
import { Stepper } from "./Stepper";
import { SwitchField } from "./Switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./Tabs";
import { TextareaField } from "./TextareaField";
import { formatKigaliTime, Timeline } from "./Timeline";

describe("Dialog and ConfirmDialog", () => {
  it("is a labelled modal that closes with Escape", async () => {
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <Dialog open={open} onOpenChange={setOpen} title="Approve" closeLabel="Close">
          <p>Body</p>
        </Dialog>
      );
    }
    const { baseElement } = renderWithProviders(<Harness />);
    expect(screen.getByRole("dialog", { name: "Approve" })).toBeInTheDocument();
    expect(await axe(baseElement)).toHaveNoViolations();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("requires a reason when asked and passes it on", async () => {
    const onConfirm = vi.fn();
    renderWithProviders(
      <ConfirmDialog
        open
        onOpenChange={() => undefined}
        title="Suspend facility"
        consequences="Patients can't book it any more."
        confirmLabel="Suspend"
        cancelLabel="Cancel"
        closeLabel="Close"
        tone="danger"
        reasonLabel="Reason"
        reasonRequired
        reasonRequiredMessage="Enter a reason"
        onConfirm={onConfirm}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Suspend" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a reason")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Reason"), "Licence expired");
    await userEvent.click(screen.getByRole("button", { name: "Suspend" }));
    expect(onConfirm).toHaveBeenCalledWith("Licence expired");
  });
});

describe("SidePanel", () => {
  it("opens as a labelled dialog", async () => {
    const { baseElement } = renderWithProviders(
      <SidePanel open onOpenChange={() => undefined} title="Clinique Ubuzima" closeLabel="Close">
        <p>Details</p>
      </SidePanel>,
    );
    expect(screen.getByRole("dialog", { name: "Clinique Ubuzima" })).toBeInTheDocument();
    expect(await axe(baseElement)).toHaveNoViolations();
  });
});

describe("Tabs, Switch, Textarea", () => {
  it("moves between tabs with the keyboard", async () => {
    renderWithProviders(
      <Tabs defaultValue="overview">
        <TabsList aria-label="Facility">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="licences">Licences</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">Overview panel</TabsContent>
        <TabsContent value="licences">Licences panel</TabsContent>
      </Tabs>,
    );
    await userEvent.click(screen.getByRole("tab", { name: "Overview" }));
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Licences" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Licences panel")).toBeVisible();
  });

  it("switch toggles and shows its state as text", async () => {
    function Harness() {
      const [on, setOn] = useState(false);
      return (
        <SwitchField
          label="PIN unlock"
          hint="Shared PCs"
          checked={on}
          onCheckedChange={setOn}
          stateLabel={on ? "On" : "Off"}
        />
      );
    }
    const { container } = renderWithProviders(<Harness />);
    const control = screen.getByRole("switch", { name: "PIN unlock" });
    await userEvent.click(control);
    expect(control).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("On")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("textarea links its error", () => {
    renderWithProviders(<TextareaField label="Note" error="Too long" />);
    expect(screen.getByLabelText("Note")).toHaveAttribute("aria-invalid", "true");
  });
});

describe("Stepper", () => {
  it("marks the current step and lets you go back", async () => {
    const back = vi.fn();
    const { container } = renderWithProviders(
      <Stepper
        label="Application steps"
        steps={[
          {
            id: "facility",
            label: "Facility",
            state: "complete",
            onSelect: back,
            stateText: "completed",
          },
          { id: "location", label: "Location", state: "current" },
          { id: "documents", label: "Documents", state: "upcoming" },
        ]}
      />,
    );
    const items = within(
      screen.getByRole("navigation", { name: "Application steps" }),
    ).getAllByRole("listitem");
    expect(items[1]).toHaveAttribute("aria-current", "step");
    await userEvent.click(screen.getByRole("button", { name: /Facility/ }));
    expect(back).toHaveBeenCalled();
    expect(await axe(container)).toHaveNoViolations();
  });
});

const uploadLabels: FileUploadLabels = {
  drop: "Drag a file here",
  browse: "Choose a file",
  camera: "Take a photo",
  hint: "PDF, JPEG or PNG, up to 10 MB",
  retry: "Try again",
  remove: "Remove",
  status: {
    uploading: "Uploading",
    pending: "Checking for viruses",
    clean: "Ready",
    infected: "Virus found",
    rejected: "Refused",
    failed: "Check failed",
    error: "Not uploaded",
  },
  tooLarge: "This file is larger than 10 MB.",
  wrongType: "Upload a PDF, JPEG or PNG file.",
};

describe("FileUpload", () => {
  it("pre-checks type and size, then hands files on", async () => {
    const onFiles = vi.fn();
    const { container } = renderWithProviders(
      <FileUpload
        label="MoH licence"
        labels={uploadLabels}
        items={[{ id: "1", name: "licence.pdf", status: "pending" }]}
        onFiles={onFiles}
        accept="application/pdf,image/jpeg,image/png"
        maxBytes={1024}
      />,
    );
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    await userEvent.upload(input, new File(["<svg/>"], "x.svg", { type: "image/svg+xml" }), {
      applyAccept: false,
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Upload a PDF, JPEG or PNG file.");
    await userEvent.upload(
      input,
      new File([new Uint8Array(2048)], "big.pdf", { type: "application/pdf" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("larger than 10 MB");
    await userEvent.upload(input, new File(["%PDF"], "ok.pdf", { type: "application/pdf" }));
    expect(onFiles).toHaveBeenCalledWith([expect.any(File)]);
    expect(screen.getByText("Checking for viruses")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});

interface Row {
  id: string;
  name: string;
  status: string;
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
  empty: "No applications yet.",
  noResults: "No applications match.",
  error: "Couldn't load.",
  retry: "Try again",
};

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: "name", header: "Name", enableSorting: true },
  { accessorKey: "status", header: "Status", enableSorting: false },
];

describe("DataTable", () => {
  it("sorts and paginates on the server, with aria-sort and visible actions", async () => {
    const onSort = vi.fn();
    const onPage = vi.fn();
    const onRow = vi.fn();
    function Harness() {
      const [sorting, setSorting] = useState<SortingState>([]);
      return (
        <DataTable<Row>
          caption="Applications"
          columns={columns}
          data={[
            { id: "a", name: "Clinique Ubuzima", status: "Submitted" },
            { id: "b", name: "Kigali Clinic", status: "Live" },
          ]}
          getRowId={(r) => r.id}
          labels={tableLabels}
          total={60}
          page={1}
          pageSize={25}
          onPageChange={onPage}
          sorting={sorting}
          onSortingChange={(next) => {
            setSorting(next);
            onSort(next);
          }}
          onRowClick={onRow}
          rowActions={(r) => <button type="button">Open {r.name}</button>}
          filters={[{ id: "status", label: "Status: submitted", onRemove: vi.fn() }]}
          onClearFilters={vi.fn()}
        />
      );
    }
    const { container } = renderWithProviders(<Harness />);
    const header = screen.getByRole("columnheader", { name: /Name/ });
    expect(header).toHaveAttribute("aria-sort", "none");
    await userEvent.click(within(header).getByRole("button"));
    expect(onSort).toHaveBeenCalledWith([{ id: "name", desc: false }]);
    expect(screen.getByRole("columnheader", { name: /Name/ })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
    expect(screen.getByText("60 results")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Next" })[0]!);
    expect(onPage).toHaveBeenCalledWith(2);
    await userEvent.click(screen.getAllByRole("button", { name: "Clinique Ubuzima" })[0]!);
    expect(onRow).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
    expect(screen.getAllByRole("button", { name: "Open Kigali Clinic" }).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Remove filter: Status: submitted" }),
    ).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("remembers the density and shows empty, no-results and error states", async () => {
    const base = {
      caption: "Facilities",
      columns,
      data: [] as Row[],
      getRowId: (r: Row) => r.id,
      labels: tableLabels,
      total: 0,
      page: 1,
      pageSize: 25,
      onPageChange: () => undefined,
    };
    const { rerender } = renderWithProviders(<DataTable<Row> {...base} />);
    expect(screen.getByText("No applications yet.")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Density"), "compact");
    expect(window.localStorage.getItem("medilink.tableDensity")).toBe("compact");
    rerender(<DataTable<Row> {...base} filtered />);
    expect(screen.getByText("No applications match.")).toBeInTheDocument();
    const retry = vi.fn();
    rerender(<DataTable<Row> {...base} error onRetry={retry} />);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalled();
  });
});

describe("Timeline", () => {
  it("shows events in Kigali time", () => {
    renderWithProviders(
      <Timeline
        locale="en"
        events={[
          {
            id: "1",
            at: "2026-10-18T07:42:00Z",
            title: "Submitted",
            actor: "Applicant",
            badge: { label: "Submitted", tone: "info" },
          },
        ]}
      />,
    );
    expect(screen.getByText(formatKigaliTime("2026-10-18T07:42:00Z", "en"))).toBeInTheDocument();
    expect(formatKigaliTime("2026-10-18T07:42:00Z", "en")).toContain("9:42");
  });
});

describe("DocumentViewer", () => {
  it("fetches a fresh link per view and per download", async () => {
    const getLink = vi.fn().mockResolvedValue({ url: "https://files.example/x.png" });
    const labels = {
      zoomIn: "Zoom in",
      zoomOut: "Zoom out",
      rotate: "Rotate",
      previousPage: "Previous page",
      nextPage: "Next page",
      page: (p: number, n: number) => `Page ${p} of ${n}`,
      download: "Download",
      loading: "Loading document",
      error: "Couldn't open the document.",
      retry: "Try again",
    };
    renderWithProviders(
      <DocumentViewer
        contentType="image/png"
        filename="licence.png"
        getLink={getLink}
        labels={labels}
      />,
    );
    const image = await screen.findByRole("img", { name: "licence.png" });
    expect(image).toHaveAttribute("src", "https://files.example/x.png");
    await userEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByText("125%")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(getLink).toHaveBeenNthCalledWith(1, "inline");
    expect(getLink).toHaveBeenNthCalledWith(2, "attachment");
  });
});
