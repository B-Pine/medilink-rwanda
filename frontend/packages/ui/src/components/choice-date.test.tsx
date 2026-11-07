import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { renderWithProviders } from "../test/render";
import { ChoiceGroup } from "./ChoiceGroup";
import { DateParts } from "./DateParts";

function DateHarness({ onIso }: { onIso: (v: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <DateParts
      label="Date of birth"
      value={value}
      onChange={(v) => {
        setValue(v);
        onIso(v);
      }}
    />
  );
}

describe("DateParts (dashboards #262)", () => {
  it("reads Day / Month / Year and emits an ISO date only for a real date", async () => {
    const user = userEvent.setup();
    const seen: string[] = [];
    const { container } = renderWithProviders(<DateHarness onIso={(v) => seen.push(v)} />);
    const group = screen.getByRole("group", { name: "Date of birth" });
    expect(group).toBeInTheDocument();
    await user.type(screen.getByLabelText("Day"), "31");
    await user.type(screen.getByLabelText("Month"), "02");
    await user.type(screen.getByLabelText("Year"), "1990");
    expect(seen.at(-1)).toBe(""); // 31 February is not a date
    await user.clear(screen.getByLabelText("Day"));
    await user.type(screen.getByLabelText("Day"), "7");
    expect(seen.at(-1)).toBe("1990-02-07");
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("ChoiceGroup", () => {
  it("is a labelled radio group of pills", async () => {
    const user = userEvent.setup();
    let picked = "";
    const { container } = renderWithProviders(
      <ChoiceGroup
        label="Protein"
        value=""
        onChange={(v) => (picked = v)}
        options={[
          { value: "negative", label: "Negative" },
          { value: "trace", label: "Trace" },
        ]}
      />,
    );
    const group = screen.getByRole("group", { name: "Protein" });
    expect(group).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Trace" }));
    expect(picked).toBe("trace");
    expect(await axe(container)).toHaveNoViolations();
  });
});
