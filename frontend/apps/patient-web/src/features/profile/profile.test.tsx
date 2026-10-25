import { MOCK_PASSWORD, PATIENTS } from "@medilink/api-client/mocks";

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
  await screen.findByRole("heading", { level: 1, name: "Hello, Mukamana Jeanne" });
  if (path !== "/home") await app.router.navigate(path);
  return app;
}

describe("patient profile", () => {
  it("home links to the profile; hub shows completion and the next step", async () => {
    const { user, router, container } = await signIn();
    await user.click(screen.getByRole("link", { name: "My profile" }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/profile\/.+/));
    expect(await screen.findByText("Complete your profile")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Next:/ })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("switching profile keeps the section and shows the relationship", async () => {
    const { user, router } = await signIn("/profile");
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/profile\/.+/));
    const trigger = await screen.findByRole("button", { name: /^Switch profile:/ });
    await user.click(trigger);
    await user.click(await screen.findByRole("menuitem", { name: /Keza Uwase/ }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Keza Uwase" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Switch profile: Keza Uwase/ })).toHaveTextContent(
      "Your child",
    );
  });

  it("health: add an unverified allergy, then remove it", async () => {
    const { user, router } = await signIn("/profile");
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/profile\/.+/));
    await user.click(await screen.findByRole("link", { name: "Allergies and health" }));
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
    expect(
      await screen.findByRole("heading", { level: 1, name: "Family and sharing" }),
    ).toBeInTheDocument();
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
    await user.click(await screen.findByRole("link", { name: "Who opened my record" }));
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
  });

  it("claim: no match gives the generic message", async () => {
    const { user } = await signIn("/claim");
    await user.type(await screen.findByLabelText("MediLink number"), "ML-0000-0000");
    await user.type(screen.getByLabelText("Date of birth"), "1990-01-01");
    await user.click(screen.getByRole("button", { name: "Find my record" }));
    expect(await screen.findByText(/couldn't match these details/)).toBeInTheDocument();
  });
});
