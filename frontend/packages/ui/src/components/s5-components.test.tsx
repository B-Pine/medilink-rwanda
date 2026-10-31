import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { renderWithProviders } from "../test/render";
import { SymptomPicker, type SymptomPickerItem } from "./SymptomPicker";

const items: SymptomPickerItem[] = [
  { code: "cough", label: "Cough", group: "respiratory" },
  { code: "chest_pain", label: "Chest pain", group: "circulatory", redFlag: true },
  { code: "fever", label: "Fever", group: "general" },
];
const groups = [
  { key: "general", label: "General" },
  { key: "respiratory", label: "Breathing" },
  { key: "circulatory", label: "Heart and chest" },
];

function Harness() {
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  return (
    <SymptomPicker
      items={items}
      groups={groups}
      chosen={chosen}
      legend="Symptoms"
      redFlagLabel="Urgent"
      onToggle={(code) =>
        setChosen((current) => {
          const next = new Set(current);
          if (next.has(code)) next.delete(code);
          else next.add(code);
          return next;
        })
      }
    />
  );
}

describe("SymptomPicker", () => {
  it("groups chips in the given order and toggles them with aria-pressed", async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<Harness />);
    const group = screen.getByRole("group", { name: "Symptoms" });
    expect(group.textContent).toMatch(/General.*Fever.*Breathing.*Cough.*Heart and chest/);
    const fever = screen.getByRole("button", { name: "Fever" });
    expect(fever).toHaveAttribute("aria-pressed", "false");
    await user.click(fever);
    expect(fever).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Chest pain" }));
    expect(screen.getByRole("button", { name: "Chest pain (Urgent)" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(fever);
    expect(fever).toHaveAttribute("aria-pressed", "false");
    expect(await axe(container)).toHaveNoViolations();
  });
});
