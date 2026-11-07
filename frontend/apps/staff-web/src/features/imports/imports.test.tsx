import { MOCK_PASSWORD, MOCK_TOTP_CODE } from "@medilink/api-client/mocks";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { logIn, renderApp } from "../../test/render";

/** S6-F7 (staff-web `imports`): the legacy register import wizard against the contract mocks. */

async function signIn(path: string) {
  const app = renderApp(path);
  await logIn(app.user, "facility.admin@medilink.test", MOCK_PASSWORD);
  await app.user.type(await screen.findByLabelText("6-digit code"), MOCK_TOTP_CODE);
  await app.user.click(screen.getByRole("button", { name: "Verify and log in" }));
  return app;
}

const CSV = [
  "Name,Sex,DOB,Phone,File no",
  "Ishimwe Grace,F,12/03/1990,0788123456,A-001",
  "Kayitesi Rose,,1985-07-01,,A-002",
  "Uwase Aline,F,1992-01-15,,A-003",
  "Mugisha Jean,M,2001-11-30,+250722000111,A-004",
].join("\n");

describe("patient import wizard (S6-F7)", () => {
  it("uploads, suggests the columns, checks rows, imports the ready ones and undoes", async () => {
    const { user, router, container } = await signIn("/settings/patient-import");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Import patients" }),
    ).toBeInTheDocument();
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(input, new File([CSV], "register.csv", { type: "text/csv" }));
    await waitFor(() => expect(router.state.location.search).toMatch(/batch=/), {
      timeout: 15_000,
    });

    // the header row's names are recognised
    const mapping = await screen.findByRole("form", { name: "Which column holds what?" });
    expect(within(mapping).getByLabelText(/^Full name/)).toHaveValue("Name");
    expect(within(mapping).getByLabelText(/^Sex/)).toHaveValue("Sex");
    expect(within(mapping).getByLabelText(/^File number/)).toHaveValue("File no");
    await user.click(within(mapping).getByRole("button", { name: "Check the rows" }));
    expect(await screen.findByText("Rows checked.")).toBeInTheDocument();

    // 2 ready, 1 problem (no sex), 1 likely duplicate (already registered)
    const ready = screen.getByText("Ready", { selector: "dt" });
    expect(ready.nextElementSibling).toHaveTextContent("2");
    expect(
      screen.getByText("With problems", { selector: "dt" }).nextElementSibling,
    ).toHaveTextContent("1");
    expect(
      screen.getByText("Likely duplicates", { selector: "dt" }).nextElementSibling,
    ).toHaveTextContent("1");
    const rows = await screen.findByRole("table", { name: "Rows" });
    expect(within(rows).getByRole("rowheader", { name: "Kayitesi Rose" })).toBeInTheDocument();
    expect(within(rows).getByText("Sex: not valid")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    await user.click(screen.getByRole("button", { name: "Import 2 patients" }));
    expect(await screen.findByText("2 patients imported.")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Undo this import" }));
    expect(await screen.findByText("Import undone.")).toBeInTheDocument();
    expect(screen.getByText(/^Undone on/)).toBeInTheDocument();
  }, 45_000);
});
