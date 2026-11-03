import { MOCK_PASSWORD, MOCK_TOTP_CODE, PATIENTS } from "@medilink/api-client/mocks";

const SELF = PATIENTS[0]!.me.profiles[0]!.patient_id;
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { renderApp } from "../../test/render";

/** S3-F7..F13 (patient profile) against the contract mocks. */

async function signIn(path = "/home") {
  const app = renderApp("/login");
  await app.user.type(await screen.findByLabelText("Email"), "patient@medilink.test");
  await app.user.click(screen.getByRole("button", { name: "Continue" }));
  const password = await screen.findByLabelText("Password");
  await waitFor(() => expect(password).toHaveFocus());
  await app.user.paste(MOCK_PASSWORD);
  await app.user.click(screen.getByRole("button", { name: "Log in" }));
  await screen.findByRole("heading", {
    level: 1,
    name: /^Good (morning|afternoon|evening), Mukamana Jeanne$/,
  });
  if (path !== "/home") await app.router.navigate(path);
  return app;
}

/** Profile pages live under the dashboard (upgrade 12): /dashboard/profile/:patientId. */
const PROFILE = /^\/dashboard\/profile\/.+/;

describe("patient profile", () => {
  it("home links to the profile; hub shows completion and the next step", async () => {
    const { user, router, container } = await signIn();
    await user.click(screen.getByRole("button", { name: /^Account menu for/ }));
    await user.click(await screen.findByRole("menuitem", { name: "My profile" }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(PROFILE));
    expect(await screen.findByText("Complete your profile")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Next:/ })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("switching profile keeps the section and shows the relationship", async () => {
    const { user, router } = await signIn("/profile");
    await waitFor(() => expect(router.state.location.pathname).toMatch(PROFILE));
    // jsdom renders the phone layout: the switcher is in the More drawer
    await user.click(screen.getByRole("button", { name: "More" }));
    const trigger = await screen.findByRole("button", { name: /^Switch profile:/ });
    await user.click(trigger);
    await user.click(await screen.findByRole("menuitem", { name: /Keza Uwase/ }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Keza Uwase" }),
    ).toBeInTheDocument();
    // the drawer closed with the new page; reopen it to read the switcher
    await user.click(screen.getByRole("button", { name: "More" }));
    expect(
      await screen.findByRole("button", { name: /^Switch profile: Keza Uwase/ }),
    ).toHaveTextContent("Your child");
  });

  it("health: add an unverified allergy, then remove it", async () => {
    const { user, router } = await signIn("/profile");
    await waitFor(() => expect(router.state.location.pathname).toMatch(PROFILE));
    await user.click(await screen.findByRole("link", { name: /^Allergies and health/ }));
    await user.type(await screen.findByLabelText("Add an allergy"), "Peanuts");
    const allergies = screen.getByRole("region", { name: "Allergies" });
    await user.click(within(allergies).getByRole("button", { name: "Add" }));
    expect(await within(allergies).findByText("Peanuts")).toBeInTheDocument();
    expect(within(allergies).getByText("Unverified")).toBeInTheDocument();
    await user.click(within(allergies).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(within(allergies).queryByText("Peanuts")).not.toBeInTheDocument());
  });

  it("family: create a sharing code with the password, shown once", async () => {
    const { user, container } = await signIn("/family");
    expect(await screen.findByRole("heading", { level: 1, name: "My family" })).toBeInTheDocument();
    const share = await screen.findByRole("region", { name: "Share a profile" });
    await user.type(within(share).getByLabelText("Your password"), "wrong-password");
    await user.click(within(share).getByRole("button", { name: "Create a code" }));
    expect(await within(share).findByText(/password is not correct/i)).toBeInTheDocument();
    await user.clear(within(share).getByLabelText("Your password"));
    await user.type(within(share).getByLabelText("Your password"), MOCK_PASSWORD);
    await user.click(within(share).getByRole("button", { name: "Create a code" }));
    expect(await within(share).findByLabelText("Sharing code")).toHaveTextContent(
      /^[0-9A-Z]{4}-[0-9A-Z]{4}$/,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("access history uses plain language", async () => {
    const { user } = await signIn(`/profile/${SELF}`);
    await user.click(await screen.findByRole("link", { name: /^Who opened my record/ }));
    expect(await screen.findByText(/Receptionist.*viewed your details/)).toBeInTheDocument();
  });

  it("privacy settings: research consent is off by default and can be switched on", async () => {
    const { user } = await signIn("/privacy/settings");
    const research = await screen.findByRole("switch", { name: /health research/ });
    expect(research).not.toBeChecked();
    await user.click(research);
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: /health research/ })).toBeChecked(),
    );
    const location = screen.getByRole("switch", { name: /Use my location/ });
    expect(location).not.toBeChecked();
    await user.click(location);
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: /Use my location/ })).toBeChecked(),
    );
    expect(screen.getByRole("switch", { name: /Messages about my care/ })).toBeInTheDocument();
  });

  it("claim: no match gives the generic message", async () => {
    const { user } = await signIn("/claim");
    await user.type(await screen.findByLabelText("MediLink number"), "ML-0000-0000");
    await user.type(screen.getByLabelText("Date of birth"), "1990-01-01");
    await user.click(screen.getByRole("button", { name: "Find my record" }));
    expect(await screen.findByText(/couldn't match these details/)).toBeInTheDocument();
  });

  it("access history loads older entries page by page", async () => {
    const { user } = await signIn(`/profile/${SELF}/access-history`);
    expect(await screen.findAllByText(/viewed your/)).toHaveLength(25);
    await user.click(screen.getByRole("button", { name: "Show older entries" }));
    await waitFor(() => expect(screen.getAllByText(/viewed your/)).toHaveLength(29));
    expect(screen.queryByRole("button", { name: "Show older entries" })).not.toBeInTheDocument();
  });

  it("claim at reception: the page polls until reception confirms", async () => {
    const app = await signIn("/claim");
    await app.user.selectOptions(await screen.findByLabelText("How do you want to find it?"), [
      "national_id",
    ]);
    await app.user.type(screen.getByLabelText("National ID"), "1198470012345678");
    await app.user.type(screen.getByLabelText("Date of birth"), "1984-01-01");
    await app.user.click(screen.getByRole("button", { name: "Find my record" }));
    const reference = await screen.findByLabelText("Claim reference");
    expect(screen.getByText(/This page updates by itself/)).toBeInTheDocument();
    const { api, queryClient } = app.services;
    await api.staffAuth.login({ email: "reception@medilink.test", password: MOCK_PASSWORD });
    await api.staffAuth.mfaVerify({ code: MOCK_TOTP_CODE });
    const found = await api.patients.search({ query: "Mukamana Jeanne" });
    const jeanne = found.results.find((r) => r.full_name === "Mukamana Jeanne")!;
    await api.patients.confirmClaim(jeanne.facility_patient_id, {
      claim_reference: reference.textContent ?? "",
      document_kind: "national_id",
      document_matches: true,
    });
    await queryClient.refetchQueries({ queryKey: ["profile", "claim"] });
    expect(
      await screen.findByText("Your record is now linked to your account."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open my profile" }).getAttribute("href")).toMatch(
      /^\/dashboard\/profile/,
    );
  });
});
