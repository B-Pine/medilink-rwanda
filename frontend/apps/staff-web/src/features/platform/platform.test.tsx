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
  it("overview shows counts and links (and is accessible)", async () => {
    const { container } = await signIn();
    expect(
      await screen.findByRole("heading", { level: 1, name: "Platform overview" }),
    ).toBeInTheDocument();
    const apps = await screen.findByRole("heading", { name: "Applications" });
    expect(
      within(apps.parentElement!).getByRole("link", { name: /^Submitted/ }),
    ).toBeInTheDocument();
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
