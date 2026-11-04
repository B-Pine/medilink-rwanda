import { MOCK_PASSWORD, MOCK_TOTP_CODE } from "@medilink/api-client/mocks";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { logIn, renderApp } from "../../test/render";

/** S1-F6..F9 (super admin console) against the contract mocks. */

async function signIn(email = "admin@medilink.test", path = "/platform") {
  const app = renderApp(path);
  await logIn(app.user, email, MOCK_PASSWORD);
  await app.user.type(await screen.findByLabelText("6-digit code"), MOCK_TOTP_CODE);
  await app.user.click(screen.getByRole("button", { name: "Verify and log in" }));
  return app;
}

describe("platform console", () => {
  // /platform opens the command centre (upgrade 2026-11-02), which replaced the S1 overview
  it("the platform home is the command centre (and is accessible)", async () => {
    const { container } = await signIn();
    expect(
      await screen.findByRole("heading", { level: 1, name: "Command centre" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Live facilities")).toBeInTheDocument();
    expect(screen.getByText("People waiting now")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("non-admins get not found", async () => {
    await signIn("reception@medilink.test", "/platform/applications");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Page not found" }),
    ).toBeInTheDocument();
  });

  it("reviews an application: start, request changes, notes", async () => {
    const { user, router } = await signIn("admin@medilink.test", "/platform/applications");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Facility applications" }),
    ).toBeInTheDocument();
    const table = await screen.findByRole("table", { name: "Facility applications" });
    expect(within(table).getByRole("columnheader", { name: /Submitted/ })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
    await user.click(
      (await within(table).findAllByRole("button", { name: "Clinique Ubuzima" }))[0]!,
    );
    const panel = await screen.findByRole("dialog", { name: "Clinique Ubuzima" });
    await user.click(within(panel).getByRole("button", { name: "Review" }));
    await waitFor(() =>
      expect(router.state.location.pathname).toMatch(/^\/platform\/applications\/.+/),
    );

    await user.click(await screen.findByRole("button", { name: "Start review" }));
    expect(await screen.findByRole("button", { name: "Approve" })).toBeDisabled(); // no accepted documents yet

    // Request changes needs at least one comment.
    await user.click(screen.getByRole("button", { name: "Request changes" }));
    const dialog = await screen.findByRole("dialog", { name: "Request changes" });
    await user.click(within(dialog).getByRole("button", { name: "Send the request" }));
    expect(await within(dialog).findByText("Add at least one comment.")).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Comment"), "Upload the MoH licence.");
    await user.click(within(dialog).getByRole("button", { name: "Send the request" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Request changes" })).not.toBeInTheDocument(),
    );
    expect((await screen.findAllByText("Changes requested")).length).toBeGreaterThan(0);

    // Notes
    await user.type(screen.getByLabelText("Note"), "Called the director.");
    await user.click(screen.getByRole("button", { name: "Add note" }));
    expect((await screen.findAllByText("Called the director.")).length).toBeGreaterThan(0);
  });

  it("facility status actions need a reason and step-up", async () => {
    const { user } = await signIn("admin@medilink.test", "/platform/facilities");
    await user.click(
      await screen.findAllByRole("link", { name: "Open: Kigali Clinic" }).then((l) => l[0]!),
    );
    expect(
      await screen.findByRole("heading", { level: 1, name: "Kigali Clinic" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Suspend" }));
    const dialog = await screen.findByRole("dialog", { name: "Suspend" });
    await user.click(within(dialog).getByRole("button", { name: "Suspend" }));
    expect(await within(dialog).findByText("Choose a reason.")).toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText("Reason"), "licence_expired");
    await user.click(within(dialog).getByRole("button", { name: "Suspend" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Suspend" })).not.toBeInTheDocument(),
    );
    expect(await screen.findByRole("button", { name: "Reactivate" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "History" }));
    expect((await screen.findAllByText(/licence.expired/i)).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("tab", { name: "Feature flags" }));
    const flag = await screen.findByRole("switch", { name: "PIN unlock" });
    await user.click(flag);
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: "PIN unlock" })).toHaveAttribute(
        "aria-checked",
        "false",
      ),
    );
    expect(await screen.findByRole("button", { name: "Use the default" })).toBeInTheDocument();
  });

  it("sets the facility's government identifiers", async () => {
    const { user } = await signIn("admin@medilink.test", "/platform/facilities");
    await user.click(
      await screen.findAllByRole("link", { name: "Open: Kigali Clinic" }).then((l) => l[0]!),
    );
    await screen.findByRole("heading", { level: 1, name: "Kigali Clinic" });
    expect(screen.getByRole("heading", { name: "Government identifiers" })).toBeInTheDocument();
    const code = screen.getByLabelText("MoH facility code (FOSA ID)");
    expect(code).toHaveValue("RW-0217");
    const tin = screen.getByLabelText("TIN");
    await user.clear(tin);
    await user.type(tin, "12AB");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("A TIN has 9 digits.")).toBeInTheDocument();
    await user.clear(tin);
    await user.type(tin, "102345679");
    await user.clear(code);
    await user.type(code, "RW-0218");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(screen.getAllByText("RW-0218").length).toBeGreaterThan(0);
  });

  it("master data: kinds, table, editor with translations and retire", async () => {
    const { user, router } = await signIn("admin@medilink.test", "/platform/master-data");
    await user.click(await screen.findByRole("link", { name: "Insurers" }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/platform/master-data/insurers"),
    );
    const table = await screen.findByRole("table", { name: "Insurers" });
    await user.click((await within(table).findAllByRole("button", { name: "rama" }))[0]!);
    const panel = await screen.findByRole("dialog", { name: /RAMA/ });
    expect(within(panel).getByLabelText("Code")).toBeDisabled();
    await user.click(within(panel).getByRole("button", { name: "Retire" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: /RAMA/ })).not.toBeInTheDocument(),
    );
    expect((await screen.findAllByText("Retired")).length).toBeGreaterThan(0);
  });

  it("master data import: upload, preview, confirm", async () => {
    const { user, router } = await signIn("admin@medilink.test", "/platform/master-data/symptoms");
    await screen.findByRole("heading", { level: 1, name: "Symptoms" });
    await user.click(screen.getByRole("button", { name: "Import CSV" }));
    const input = (
      await screen.findByRole("dialog", { name: "Import CSV" })
    ).querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(
      input,
      new File(
        ["code,name_rw,name_en,name_fr,body_system,icd_code\nitch,A,Itching,B,skin,\n"],
        "symptoms.csv",
        { type: "text/csv" },
      ),
    );
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/imports\/.+/));
    expect(await screen.findByText("Ready to apply")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Apply the changes" }));
    expect(await screen.findByText("Applied", {}, { timeout: 6000 })).toBeInTheDocument();
  }, 45_000);
});

describe("platform admin data (2026-11-03)", () => {
  it("registers a facility with everything known, then lands on its review page", async () => {
    const { user } = await signIn("admin@medilink.test", "/platform/applications");
    await user.click(await screen.findByRole("link", { name: "Register a facility" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Register a facility" }),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText("Facility name"), "Ivuriro Clinic");
    await user.type(screen.getByLabelText(/^TIN/), "12");
    await user.click(screen.getByRole("button", { name: "Create the application" }));
    expect(await screen.findByText("A TIN has 9 digits.")).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/^TIN/));
    await user.type(screen.getByLabelText(/^TIN/), "102345678");
    await user.type(screen.getByLabelText(/^MoH facility code/), "FOSA-901");
    await user.type(screen.getByLabelText("Latitude"), "-1.95");
    await user.type(screen.getByLabelText("Longitude"), "30.06");
    const names = screen.getAllByLabelText("Full name");
    await user.type(names[0]!, "Mukamana Jeanne");
    await user.type(screen.getAllByLabelText("Email")[1]!, "jeanne@ivuriro.example");
    await user.type(names[1]!, "Habimana Eric");
    await user.click(screen.getByRole("button", { name: "Create the application" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Ivuriro Clinic" }),
    ).toBeInTheDocument();
    expect(screen.getByText("FOSA-901")).toBeInTheDocument();
    expect(screen.getByText(/Habimana Eric/)).toBeInTheDocument();
    // a draft: the admin can still edit it and add documents
    expect(screen.getByRole("link", { name: "Edit details" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Add a document for the facility" }),
    ).toBeInTheDocument();
  }, 45_000);

  it("the facility list shows identifiers, people and staff, and exports CSV", async () => {
    const { user } = await signIn("admin@medilink.test", "/platform/facilities");
    const table = await screen.findByRole("table", { name: "Facilities" });
    expect(await within(table).findByText("FOSA RW-0217")).toBeInTheDocument();
    expect(within(table).getByText("Mutesi Diane")).toBeInTheDocument();
    expect(within(table).getByText("Kimironko")).toBeInTheDocument();
    expect(within(table).getByText("6 active staff")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeInTheDocument();
    await user.click(within(table).getAllByRole("link", { name: "Open: Kigali Clinic" })[0]!);
    expect(await screen.findByRole("heading", { name: "In charge" })).toBeInTheDocument();
    expect(screen.getByText("info@kigaliclinic.example")).toBeInTheDocument();
    expect(
      screen.getByText("Abatuje, Bibare, Kimironko, Gasabo, Umujyi wa Kigali"),
    ).toBeInTheDocument();
  }, 45_000);

  it("users show phone, profession and licence", async () => {
    await signIn("admin@medilink.test", "/platform/users");
    const table = await screen.findByRole("table");
    expect((await within(table).findAllByText("Medical doctor")).length).toBeGreaterThan(0);
    expect(within(table).getAllByText("Licence valid").length).toBeGreaterThan(0);
  }, 45_000);

  // #198: counts, attention links and filters kept in the address
  it("the user list counts accounts and filters by facility from the facility page", async () => {
    const { user, router } = await signIn("admin@medilink.test", "/platform/users");
    expect(await screen.findByRole("button", { name: /Patients\s*4/ })).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "1 locked account" }));
    await waitFor(() => expect(router.state.location.search).toBe("?status=locked"));
    const table = await screen.findByRole("table", { name: "Users" });
    expect(await within(table).findByText("Habyarimana Joseph")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Export staff accounts/ })).toBeInTheDocument();

    await router.navigate("/platform/facilities/4f0c1d2e-5b6a-4c7d-8e9f-0a1b2c3d4e01");
    expect(await screen.findByRole("link", { name: "Mutesi Diane" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/platform\/users\/.+/),
    );
    await user.click(screen.getByRole("link", { name: "See the staff in the user list" }));
    const staff = await screen.findByRole("table", { name: "Users" });
    expect(await within(staff).findByText("Uwimana Grace")).toBeInTheDocument();
    await waitFor(() =>
      expect(within(staff).queryByText("Umutoni Claire")).not.toBeInTheDocument(),
    );
  }, 45_000);

  it("a person's page clears a sign-in block, sends a reset link and removes facility access", async () => {
    const { user, container } = await signIn("admin@medilink.test", "/platform/users");
    const table = await screen.findByRole("table", { name: "Users" });
    await user.click(await within(table).findByRole("button", { name: /^Uwimana Grace/ }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Uwimana Grace" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Sign-in is blocked for 11 more minutes/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    const reason = async (button: string) => {
      const dialog = await screen.findByRole("dialog");
      await user.type(within(dialog).getByLabelText(/^Reason/), "She called the help desk.");
      await user.click(within(dialog).getByRole("button", { name: button }));
      return dialog;
    };

    await user.click(screen.getAllByRole("button", { name: "Clear sign-in block" })[0]!);
    await reason("Clear sign-in block");
    await waitFor(() => expect(screen.queryByText(/Sign-in is blocked/)).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Send password reset link" }));
    const sent = await reason("Send password reset link");
    expect(await within(sent).findByText(/Sent to reception@medilink.test/)).toBeInTheDocument();
    await user.click(within(sent).getAllByRole("button", { name: "Close" }).at(-1)!);

    await user.click(screen.getByRole("button", { name: "Remove access" }));
    await reason("Remove access");
    expect(await screen.findByText(/Access removed/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore access" })).toBeInTheDocument();
    expect(screen.getByText("Facility access removed")).toBeInTheDocument();
  }, 60_000);

  it("corrects a person's details with a reason", async () => {
    const { user } = await signIn("admin@medilink.test", "/platform/users");
    const table = await screen.findByRole("table", { name: "Users" });
    await user.click(await within(table).findByRole("button", { name: /^Mutesi Alice/ }));
    await user.click(await screen.findByRole("button", { name: "Correct details" }));
    const dialog = await screen.findByRole("dialog", { name: "Correct details" });
    const name = within(dialog).getByLabelText("Full name");
    await user.clear(name);
    await user.type(name, "Mutesi Alice Uwera");
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled(); // no reason yet
    await user.type(within(dialog).getByLabelText(/^Reason/), "Name misspelt at invitation.");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Mutesi Alice Uwera" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Details corrected by admin")).toBeInTheDocument();
  }, 45_000);
});
