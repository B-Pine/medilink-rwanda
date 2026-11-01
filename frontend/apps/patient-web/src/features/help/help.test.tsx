import { MOCK_HELP, MOCK_PASSWORD } from "@medilink/api-client/mocks";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { renderApp } from "../../test/render";

/** S10-F1..F4 (patient-web `help`) against the contract mocks. */

async function signIn(next = "/support", language: "en" | "fr" = "en") {
  const app = renderApp("/login", { language });
  await app.user.type(
    await screen.findByLabelText(language === "fr" ? "E-mail" : "Email"),
    "patient@medilink.test",
  );
  await app.user.click(
    screen.getByRole("button", { name: language === "fr" ? "Continuer" : "Continue" }),
  );
  const password = await screen.findByLabelText(language === "fr" ? "Mot de passe" : "Password");
  await waitFor(() => expect(password).toHaveFocus());
  await app.user.paste(MOCK_PASSWORD);
  await app.user.click(
    screen.getByRole("button", { name: language === "fr" ? "Se connecter" : "Log in" }),
  );
  await screen.findByRole("heading", { level: 1 });
  await app.router.navigate(next);
  return app;
}

describe("Help tab (S10-F1)", () => {
  it("emergency first, search, category filter, Contact support and My requests", async () => {
    const { user, container } = await signIn();
    expect(await screen.findByRole("heading", { level: 1, name: "Help" })).toBeInTheDocument();
    const articles = await screen.findByRole("region", { name: "Help articles" });
    // the emergency notice comes before the articles
    const emergency = screen.getByText(/call 912/);
    expect(
      emergency.compareDocumentPosition(articles) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      await within(articles).findByRole("link", { name: /Add your child/ }),
    ).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    await user.click(within(articles).getByRole("button", { name: "Notifications" }));
    expect(
      await within(articles).findByRole("link", { name: /Turn on notifications/ }),
    ).toBeInTheDocument();
    expect(
      within(articles).queryByRole("link", { name: /Add your child/ }),
    ).not.toBeInTheDocument();
    await user.click(within(articles).getByRole("button", { name: "All" }));

    await user.type(within(articles).getByLabelText("Search help"), "cancel");
    await user.click(within(articles).getByRole("button", { name: "Search" }));
    expect(await within(articles).findByText("1 article")).toBeInTheDocument();
    expect(
      within(articles).getByRole("link", { name: /Cancel or move a booking/ }),
    ).toBeInTheDocument();

    const contact = screen.getByRole("region", { name: "Still need help?" });
    expect(within(contact).getByRole("link", { name: "Contact support" })).toHaveAttribute(
      "href",
      "/support/requests/new",
    );
    expect(
      await within(contact).findByRole("link", { name: /My requests.*1 open/ }),
    ).toBeInTheDocument();
  });

  it("falls back to another language with a note", async () => {
    await signIn("/support", "fr");
    const articles = await screen.findByRole("region", { name: "Articles d'aide" });
    // no French text: Kinyarwanda first (rw → en → fr), with a note
    const card = await within(articles).findByRole("link", { name: /Fungura kumenyeshwa/ });
    expect(within(card).getByText(/^Affiché en kinyarwanda/)).toBeInTheDocument();
  });
});

describe("article (S10-F2)", () => {
  it("renders paragraphs and lists as text, and a not-found card", async () => {
    const { container, router } = await signIn("/support/articles/add-a-child");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Add your child" }),
    ).toBeInTheDocument();
    const article = screen.getByRole("article", { name: "Add your child" });
    expect(
      within(article)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual([
      "Open Profile",
      "Choose Add a family member",
      "Enter the child's name and date of birth",
    ]);
    expect(article.querySelector("a, script")).toBeNull();
    expect(await axe(container)).toHaveNoViolations();

    await router.navigate("/support/articles/check-in-a-walk-in"); // a staff article
    expect(
      await screen.findByRole("heading", { level: 1, name: "Article not found" }),
    ).toBeInTheDocument();
  });
});

describe("new request (S10-F3)", () => {
  it("health questions go to the facility and send nothing", async () => {
    const { user } = await signIn("/support/requests/new");
    await user.click(await screen.findByLabelText("My health or treatment"));
    expect(screen.getByText("We can't help with health questions here")).toBeInTheDocument();
    const redirect = screen
      .getByText("We can't help with health questions here")
      .closest("div")!.parentElement!;
    expect(within(redirect).getByRole("link", { name: "Find care" })).toHaveAttribute(
      "href",
      "/find-care",
    );
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
  });

  it("shows server field errors inline, then sends and opens the request", async () => {
    const { user, container } = await signIn("/support/requests/new");
    await user.click(await screen.findByLabelText("Something isn't working"));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.type(screen.getByLabelText("Subject"), "My HIV results page is blank");
    await user.type(
      screen.getByLabelText(/^What happened\?/),
      "The page stays white when I open it.",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Please fix these before sending")).toBeInTheDocument();
    expect(screen.getByLabelText("Subject")).toHaveAccessibleDescription(/health details/);
    expect(await axe(container)).toHaveNoViolations();

    await user.clear(screen.getByLabelText("Subject"));
    await user.type(screen.getByLabelText("Subject"), "A page stays blank");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "A page stays blank" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Request SR-[A-Z0-9]{6} sent\./)).toBeInTheDocument();
    expect(screen.getByText("Waiting for MediLink")).toBeInTheDocument();
  });
});

describe("requests and thread (S10-F4)", () => {
  it("lists my requests with status badges", async () => {
    const { container } = await signIn("/support/requests");
    const list = await screen.findByRole("list", { name: "My requests" });
    const row = within(list).getByRole("link", { name: /SR-7K3QXM/ });
    expect(within(row).getByText("Reply from MediLink")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("thread shows MediLink support, replies, closes with confirm and offers a new request", async () => {
    const { user, container } = await signIn(`/support/requests/${MOCK_HELP.patientRequestId}`);
    expect(
      await screen.findByRole("heading", { level: 1, name: "I can't cancel my booking" }),
    ).toBeInTheDocument();
    const thread = screen.getByRole("list", { name: "Request SR-7K3QXM" });
    expect(within(thread).getByText(/MediLink support/)).toBeInTheDocument();
    expect(within(thread).queryByText(/Ingabire Grace/)).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    await user.type(screen.getByLabelText("Your reply"), "It still fails after updating.");
    await user.click(screen.getByRole("button", { name: "Send reply" }));
    expect(await screen.findByText("Reply sent.")).toBeInTheDocument();
    expect(within(thread).getByText("It still fails after updating.")).toBeInTheDocument();
    expect(screen.getByText("Waiting for MediLink")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close request" }));
    const confirm = screen.getByRole("group", { name: "Close request" });
    await user.click(within(confirm).getByRole("button", { name: "Close it" }));
    expect(await screen.findByText("This request is closed")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open a new request" })).toHaveAttribute(
      "href",
      "/support/requests/new",
    );
    expect(screen.queryByLabelText("Your reply")).not.toBeInTheDocument();
  });
});
