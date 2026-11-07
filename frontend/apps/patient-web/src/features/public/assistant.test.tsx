import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { renderApp } from "../../test/render";

/** AI symptom assistant, test phase (issue #159), against the scripted mock. */

describe("the public site without the assistant (the default)", () => {
  it("/assistant opens the guided questions; no floating button, no link to it", async () => {
    renderApp("/assistant");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Not sure where to go?" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open the AI assistant" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Try the AI assistant/ })).not.toBeInTheDocument();
  });
});

describe("AI symptom assistant (switched on)", () => {
  beforeEach(() => vi.stubEnv("VITE_PUBLIC_ASSISTANT", "true"));
  afterEach(() => vi.unstubAllEnvs());

  it("asks a follow-up, then names a possible cause and shows places for the service", async () => {
    const { user, container } = renderApp("/assistant");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Tell us how you feel" }),
    ).toBeInTheDocument();
    // test phase and privacy are said before anything is typed
    expect(screen.getByText("This is a test version")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    await user.type(screen.getByLabelText("Describe how you feel"), "fever and headache");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Do you also have vomiting?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Yes" }));
    expect(await screen.findByText(/You may have malaria/)).toBeInTheDocument();
    expect(screen.getByText("Possible cause: malaria")).toBeInTheDocument();
    expect(screen.getByText("See a doctor today")).toBeInTheDocument();
    const places = await screen.findByRole("list", { name: "Facilities that can help" });
    expect(within(places).getAllByRole("listitem").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "See more facilities" })).toHaveAttribute(
      "href",
      "/find-care?service=general_consultation",
    );
    expect(await axe(container)).toHaveNoViolations();

    await user.click(screen.getByRole("button", { name: "Start again" }));
    expect(screen.queryByText(/You may have malaria/)).not.toBeInTheDocument();
  });

  it("a danger sign shows the emergency number and ends the chat", async () => {
    const { user } = renderApp("/assistant");
    await user.type(await screen.findByLabelText("Describe how you feel"), "I have chest pain");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("912");
    expect(screen.queryByLabelText("Describe how you feel")).not.toBeInTheDocument();
  });

  it("the floating button opens the chat in a panel on other pages", async () => {
    const { user } = renderApp("/check-symptoms");
    await user.click(await screen.findByRole("button", { name: "Open the AI assistant" }));
    const panel = await screen.findByRole("dialog", { name: /AI health assistant/ });
    expect(within(panel).getByText("This is a test version")).toBeInTheDocument();

    await user.type(within(panel).getByLabelText("Describe how you feel"), "fever and headache");
    await user.click(within(panel).getByRole("button", { name: "Send" }));
    expect(await within(panel).findByText("Do you also have vomiting?")).toBeInTheDocument();

    // closing keeps the conversation
    await user.click(within(panel).getByRole("button", { name: "Close the assistant" }));
    await user.click(screen.getByRole("button", { name: "Open the AI assistant" }));
    expect(await screen.findByText("Do you also have vomiting?")).toBeInTheDocument();
  });

  it("the full assistant page has no floating button", async () => {
    renderApp("/assistant");
    await screen.findByRole("heading", { level: 1, name: "Tell us how you feel" });
    expect(screen.queryByRole("button", { name: "Open the AI assistant" })).not.toBeInTheDocument();
  });

  it("the symptom checker links to the assistant", async () => {
    renderApp("/check-symptoms");
    expect(await screen.findByRole("link", { name: /Try the AI assistant/ })).toHaveAttribute(
      "href",
      "/assistant",
    );
  });
});
