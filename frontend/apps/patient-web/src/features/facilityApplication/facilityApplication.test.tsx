import { MOCK_RESUME_TOKEN } from "@medilink/api-client/mocks";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { renderApp } from "../../test/render";
import { insideRwanda, stepOf } from "./data";

/** S1-F1..F5, F13 (patient-web): the "For facilities" page and the application wizard. */

const pdf = (name = "licence.pdf") =>
  new File(["%PDF-1.7 mock"], name, { type: "application/pdf" });

async function startApplication() {
  const app = renderApp("/for-facilities/apply");
  await app.user.type(await screen.findByLabelText("Facility name"), "Clinique Ubuzima");
  await app.user.type(screen.getByLabelText("Your full name"), "Mukamana Jeanne");
  await app.user.type(screen.getByLabelText("Email"), "jeanne@ubuzima.example");
  await app.user.click(screen.getByRole("button", { name: "Start the application" }));
  await screen.findByRole("heading", { level: 1, name: "Facility" });
  return app;
}

describe("For facilities", () => {
  it("explains onboarding and leads to the start form", async () => {
    const { user, container } = renderApp("/for-facilities");
    expect(
      await screen.findByRole("heading", { level: 1, name: "MediLink for health facilities" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How onboarding works" })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
    await user.click(screen.getByRole("link", { name: "Register your facility" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Register your facility" }),
    ).toBeInTheDocument();
  });

  it("asks for a resume link without revealing whether the email exists", async () => {
    const { user } = renderApp("/for-facilities");
    const form = within(
      await screen
        .findByRole("heading", { name: "Continue an application" })
        .then((h) => h.closest("div")!),
    );
    await user.type(form.getByLabelText("Email"), "someone@example.test");
    await user.click(form.getByRole("button", { name: "Send me a link" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/If there is an open application/);
  });
});

describe("application wizard", () => {
  it("validates the start form", async () => {
    const { user } = renderApp("/for-facilities/apply");
    await user.click(await screen.findByRole("button", { name: "Start the application" }));
    const summary = await screen.findByRole("alert");
    expect(within(summary).getAllByRole("link").length).toBe(3);
  });

  it("walks through the steps with autosave, cascading locations, uploads and submit", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { user, router, container } = await startApplication();
      expect(screen.getByRole("navigation", { name: "Application steps" })).toBeInTheDocument();
      expect(await axe(container)).toHaveNoViolations();

      // Facility step: autosave after a pause.
      await user.selectOptions(await screen.findByLabelText("Type of facility"), "private_clinic");
      await user.selectOptions(screen.getByLabelText("Ownership"), "public");
      await user.type(screen.getByLabelText("Facility phone"), "+250788123456");
      await user.type(screen.getByLabelText("Facility email"), "info@ubuzima.example");
      await act(() => vi.advanceTimersByTimeAsync(1000));
      expect(await screen.findByText(/^Saved /)).toBeInTheDocument();

      // Location: Province -> District -> Sector -> Cell -> Village.
      await user.click(screen.getByRole("button", { name: "Next" }));
      await screen.findByRole("heading", { level: 1, name: "Location" });
      await user.selectOptions(await screen.findByLabelText("Province"), "1");
      await user.selectOptions(await screen.findByLabelText("District"), "12");
      await user.selectOptions(await screen.findByLabelText("Sector"), "DEV-1201");
      await user.selectOptions(await screen.findByLabelText("Cell"), "DEV-120101");
      await waitFor(() => expect(screen.getByLabelText("Village")).not.toBeDisabled());
      await user.selectOptions(screen.getByLabelText("Village"), "DEV-12010101");
      await user.type(screen.getByLabelText("Street address"), "KG 11 Ave 5");
      await act(() => vi.advanceTimersByTimeAsync(1000));

      // Documents: a public facility needs only the MoH licence (with number and expiry).
      await user.click(screen.getByRole("button", { name: "Next" }));
      await screen.findByRole("heading", { level: 1, name: "Documents" });
      expect(screen.queryByText("RDB registration")).not.toBeInTheDocument();
      await user.type(screen.getByLabelText("Licence number"), "MOH/FL/2024/0312");
      await user.type(screen.getByLabelText("Expiry date"), "2030-02-28");
      const input = container.querySelector<HTMLInputElement>(
        'section[id="documents.moh_licence"] input[type="file"]',
      )!;
      await user.upload(input, pdf());
      await screen.findByText("Ready", {}, { timeout: 8000 }).catch(() => {
        throw new Error("DBG " + document.querySelector("main")?.textContent?.slice(0, 700));
      });

      // Administrator.
      await user.click(screen.getByRole("button", { name: "Next" }));
      await screen.findByRole("heading", { level: 1, name: "Administrator" });
      await user.type(screen.getByLabelText("Administrator's full name"), "Habimana Eric");
      await user.type(screen.getByLabelText("Administrator's email"), "eric@ubuzima.example");
      await user.type(screen.getByLabelText("Administrator's phone"), "+250788000222");
      await user.type(screen.getByLabelText("Your phone"), "+250788000111");
      await user.type(screen.getByLabelText("Your position"), "Director");
      await act(() => vi.advanceTimersByTimeAsync(1000));

      // Review: agreements are required, then submit.
      await user.click(screen.getByRole("button", { name: "Next" }));
      await screen.findByRole("heading", { level: 1, name: "Review and submit" });
      await user.click(screen.getByRole("button", { name: "Submit the application" }));
      expect(await screen.findByText("Accept the terms of use.")).toBeInTheDocument();
      for (const label of [
        /terms of use/,
        /data processing agreement/,
        /National Cyber Security Authority/,
      ]) {
        await user.click(screen.getByLabelText(label));
      }
      await user.click(screen.getByRole("button", { name: "Submit the application" }));
      expect(
        await screen.findByRole("heading", { level: 1, name: "Application submitted" }),
      ).toBeInTheDocument();
      expect(router.state.location.pathname).toMatch(/\/submitted$/);
    } finally {
      vi.useRealTimers();
    }
  }, 30_000);

  it("pre-checks file type and size before uploading", async () => {
    const { container, router } = await startApplication();
    await act(() =>
      router.navigate(router.state.location.pathname.replace("facility", "documents")),
    );
    await screen.findByRole("heading", { level: 1, name: "Documents" });
    const input = container.querySelector<HTMLInputElement>(
      'section[id="documents.moh_licence"] input[type="file"]',
    )!;
    // fireEvent: user.upload would drop the file because of the input's `accept`.
    fireEvent.change(input, {
      target: { files: [new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" })] },
    });
    expect(await screen.findByText("Upload a PDF, JPEG, PNG or HEIC file.")).toBeInTheDocument();
  });

  it("continue later ends the session", async () => {
    const { user, router } = await startApplication();
    await user.click(screen.getByRole("button", { name: "Continue later" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/for-facilities"));
    expect(await screen.findByText(/Your application is saved/)).toBeInTheDocument();
  });

  it("resume exchanges the token and removes it from the address bar", async () => {
    await startApplication();
    const replace = vi.spyOn(window.history, "replaceState");
    const { router } = renderApp(`/for-facilities/apply/resume?token=${MOCK_RESUME_TOKEN}`);
    await waitFor(() =>
      expect(router.state.location.pathname).toMatch(/\/for-facilities\/apply\/.+\/facility$/),
    );
    expect(replace).toHaveBeenCalled();
    replace.mockRestore();
  });

  it("an invalid resume link offers a new link", async () => {
    renderApp("/for-facilities/apply/resume?token=expired");
    expect(await screen.findByText(/This link is invalid or has expired/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send me a link" })).toBeInTheDocument();
  });
});

describe("helpers", () => {
  it("maps fields to steps and checks Rwanda's bounds", () => {
    expect(stepOf("location.village_code")).toBe("location");
    expect(stepOf("documents.moh_licence")).toBe("documents");
    expect(stepOf("proposed_admin.email")).toBe("admin");
    expect(stepOf("facility.phone")).toBe("facility");
    expect(stepOf("applicant.phone")).toBe("admin");
    expect(stepOf("accepted_terms_version")).toBe("review");
    expect(insideRwanda(-1.9441, 30.0619)).toBe(true);
    expect(insideRwanda(0.3476, 32.5825)).toBe(false); // Kampala
  });
});
