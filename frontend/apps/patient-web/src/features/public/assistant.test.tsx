import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { renderApp } from "../../test/render";

/** AI symptom assistant, test phase (issue #159), against the scripted mock. */

describe("AI symptom assistant", () => {
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
    const places = await screen.findByRole("list", { name: "Places that can help" });
    expect(within(places).getAllByRole("listitem").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "See more places" })).toHaveAttribute(
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

  it("the symptom checker links to the assistant", async () => {
    renderApp("/check-symptoms");
    expect(await screen.findByRole("link", { name: /Try the AI assistant/ })).toHaveAttribute(
      "href",
      "/assistant",
    );
  });
});
