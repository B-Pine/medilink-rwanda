import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { renderWithProviders } from "../test/render";
import { CameraCapture } from "./CameraCapture";
import { MaskedValue } from "./MaskedValue";
import { detectSearchType, PersonSearch, type PersonSearchLabels } from "./PersonSearch";
import { formatPhone, PhoneField, toE164 } from "./PhoneField";
import { ProfileSwitcher } from "./ProfileSwitcher";

const searchLabels: PersonSearchLabels = {
  label: "Find a patient",
  placeholder: "Name, phone, ID or MediLink number",
  types: {
    medilink_number: "MediLink no.",
    national_id: "National ID",
    phone: "Phone",
    file_number: "File no.",
    name: "Name",
  },
  resultCount: (n) => `${n} results`,
};

const maskLabels = {
  reveal: "Show",
  hide: "Hide",
  revealing: "Showing…",
  failed: "Couldn't show it",
};

describe("detectSearchType and phone helpers", () => {
  it("detects 16 digits, ML-, phones, file numbers and names", () => {
    expect(detectSearchType("1 1984 7 0012345 6 78")).toBe("national_id");
    expect(detectSearchType("ml-7k3q-9xw2")).toBe("medilink_number");
    expect(detectSearchType("0788 123 456")).toBe("phone");
    expect(detectSearchType("+250788123456")).toBe("phone");
    expect(detectSearchType("A-1234")).toBe("file_number");
    expect(detectSearchType("Mukamana")).toBe("name");
  });

  it("normalises Rwandan mobile numbers", () => {
    expect(toE164("0788 123 456")).toBe("+250788123456");
    expect(toE164("250788123456")).toBe("+250788123456");
    expect(toE164("")).toBeNull();
    expect(toE164("0212")).toBe("");
    expect(formatPhone("+250788123456")).toBe("+250 788 123 456");
  });
});

describe("PersonSearch", () => {
  it("shows the type chip, announces results, navigates with arrows and / focuses", async () => {
    const onSelect = vi.fn();
    const onSearch = vi.fn();
    function Harness() {
      const [value, setValue] = useState("");
      return (
        <>
          <button type="button">Elsewhere</button>
          <PersonSearch
            value={value}
            onChange={setValue}
            onSearch={onSearch}
            onSelect={onSelect}
            labels={searchLabels}
            results={
              value
                ? [
                    { id: "a", label: "Mukamana Jeanne", description: "42 · female" },
                    { id: "b", label: "Jeanne Mukamana" },
                  ]
                : undefined
            }
          />
        </>
      );
    }
    const user = userEvent.setup();
    const { container } = renderWithProviders(<Harness />);
    screen.getByRole("button", { name: "Elsewhere" }).focus();
    await user.keyboard("/");
    const input = screen.getByRole("combobox", { name: "Find a patient" });
    expect(input).toHaveFocus();
    await user.type(input, "Mukamana");
    expect(screen.getByTestId("search-type")).toHaveTextContent("Name");
    expect(screen.getByText("2 results")).toBeInTheDocument();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "b" }));
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("MaskedValue", () => {
  it("reveals on demand and re-masks after the timeout and on hide", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onReveal = vi.fn().mockResolvedValue("1198470012345678");
    const { container } = renderWithProviders(
      <MaskedValue masked="••••5678" name="National ID" labels={maskLabels} onReveal={onReveal} />,
    );
    expect(screen.getByText("••••5678")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
    await user.click(screen.getByRole("button", { name: "Show: National ID" }));
    expect(await screen.findByText("1198470012345678")).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(30_001);
      await Promise.resolve();
    });
    expect(screen.getByText("••••5678")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show: National ID" }));
    await screen.findByText("1198470012345678");
    await user.click(screen.getByRole("button", { name: "Hide: National ID" }));
    expect(screen.getByText("••••5678")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("stays masked when the reveal is cancelled", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <MaskedValue
        masked="••••5678"
        name="ID"
        labels={maskLabels}
        onReveal={() => Promise.resolve(null)}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Show: ID" }));
    expect(screen.getByText("••••5678")).toBeInTheDocument();
  });
});

describe("ProfileSwitcher", () => {
  it("lists profiles with relationship badges and switches", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <ProfileSwitcher
        label="Switch profile"
        currentId="self"
        onSelect={onSelect}
        profiles={[
          { id: "self", name: "Mukamana Jeanne", relationship: "You" },
          { id: "child", name: "Keza Uwase", relationship: "Your child" },
        ]}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
    await user.click(screen.getByRole("button", { name: "Switch profile: Mukamana Jeanne" }));
    await user.click(await screen.findByRole("menuitem", { name: /Keza Uwase/ }));
    expect(onSelect).toHaveBeenCalledWith("child");
  });
});

describe("PhoneField and CameraCapture", () => {
  it("PhoneField is a labelled tel input", async () => {
    const { container } = renderWithProviders(<PhoneField label="Phone" optional />);
    expect(screen.getByLabelText(/Phone/)).toHaveAttribute("type", "tel");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("CameraCapture falls back to the file input without a camera", async () => {
    const onCapture = vi.fn();
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <CameraCapture
        onCapture={onCapture}
        labels={{
          start: "Use camera",
          capture: "Take photo",
          retake: "Retake",
          use: "Use photo",
          chooseFile: "Choose a photo",
          unavailable: "The camera isn't available. Choose a photo instead.",
        }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Use camera" }));
    expect(await screen.findByRole("status")).toHaveTextContent("camera isn't available");
    const file = new File(["x"], "card.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText("Choose a photo"), file);
    expect(onCapture).toHaveBeenCalledWith(file);
    expect(await axe(container)).toHaveNoViolations();
  });
});
