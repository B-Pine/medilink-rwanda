import {
  MOCK_PASSWORD,
  MOCK_SHARE_TOKEN,
  MOCK_VERIFY_CODE,
  MOCK_VERIFY_DOB,
} from "@medilink/api-client/mocks";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { renderApp } from "../../test/render";

/** S7-F7 (patient-web `documents`, public verification) against the contract mocks. */

async function signIn(next = "/home") {
  const app = renderApp("/login");
  await app.user.type(await screen.findByLabelText("Email"), "patient@medilink.test");
  await app.user.click(screen.getByRole("button", { name: "Continue" }));
  const password = await screen.findByLabelText("Password");
  await waitFor(() => expect(password).toHaveFocus());
  await app.user.paste(MOCK_PASSWORD);
  await app.user.click(screen.getByRole("button", { name: "Log in" }));
  await screen.findByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening)/ });
  if (next !== "/home") await app.router.navigate(next);
  return app;
}

describe("My documents (S7-F7)", () => {
  it("lists documents; the detail downloads, makes a share link once and stops it", async () => {
    const { user, container } = await signIn("/documents");
    expect(
      await screen.findByRole("heading", { level: 1, name: "My documents" }),
    ).toBeInTheDocument();
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    await user.click(await screen.findByRole("button", { name: "Download all (ZIP)" }));
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(expect.stringMatching(/\.pdf$/), "_self"),
    );

    await user.click(screen.getByRole("link", { name: /^Prescription/ }));
    expect(await screen.findByText(MOCK_VERIFY_CODE)).toBeInTheDocument();
    expect(screen.getByText(/This is version 2/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Download" }));
    await waitFor(() =>
      expect(open).toHaveBeenLastCalledWith(expect.stringMatching(/RX-2026-000106\.pdf$/), "_self"),
    );

    const share = screen.getByRole("region", { name: "Share with someone" });
    expect(within(share).getByText(/^Opened 1 time/)).toBeInTheDocument();
    await user.selectOptions(within(share).getByRole("combobox", { name: "The link lasts" }), "30");
    await user.click(within(share).getByRole("button", { name: "Make a link" }));
    const made = await within(share).findByRole("status");
    expect(made).toHaveTextContent(/\/shared\/tok-/);
    expect(made).toHaveTextContent("we show it only once");
    await waitFor(() =>
      expect(within(share).getAllByRole("button", { name: "Stop this link" })).toHaveLength(2),
    );
    await user.click(within(share).getAllByRole("button", { name: "Stop this link" })[0]!);
    await waitFor(() =>
      expect(within(share).getAllByRole("button", { name: "Stop this link" })).toHaveLength(1),
    );
    expect(await axe(container)).toHaveNoViolations();
    open.mockRestore();
  });
});

describe("public verification (S7-F7, V1)", () => {
  it("shows the minimal projection, then the content after the date of birth", async () => {
    const { user, container } = renderApp("/verify");
    await user.type(
      await screen.findByLabelText("Verification code", {}, { timeout: 5000 }),
      MOCK_VERIFY_CODE.toLowerCase(),
    );
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(
      await screen.findByRole("heading", { name: "Genuine MediLink document" }),
    ).toBeInTheDocument();
    expect(screen.getByText("RX-2026-000106")).toBeInTheDocument();
    expect(screen.queryByText(/Amlodipine/)).not.toBeInTheDocument();

    const dob = screen.getByLabelText("Patient's date of birth");
    await user.type(dob, "2000-01-01");
    await user.click(screen.getByRole("button", { name: "Show the content" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That date of birth doesn't match this document.",
    );
    await user.clear(dob);
    await user.type(dob, MOCK_VERIFY_DOB);
    await user.click(screen.getByRole("button", { name: "Show the content" }));
    expect(await screen.findByText(/Amlodipine 5 mg tablet/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("an unknown code says so; a shared link opens one document", async () => {
    renderApp("/verify/NOPE000000");
    expect(await screen.findByText("No document has this code")).toBeInTheDocument();
  });

  it("a shared link shows the document and its download", async () => {
    renderApp(`/shared/${MOCK_SHARE_TOKEN}`);
    expect(await screen.findByText("RX-2026-000106")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument();
  });
});
