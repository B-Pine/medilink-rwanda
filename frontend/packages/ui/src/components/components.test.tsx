import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { renderWithProviders } from "../test/render";
import { Alert } from "./Alert";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Card } from "./Card";
import { CheckboxField } from "./CheckboxField";
import { ErrorSummary } from "./ErrorSummary";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Logo } from "./Logo";
import { PasswordField } from "./PasswordField";
import { SkipLink } from "./SkipLink";
import { Spinner } from "./Spinner";
import { TextField } from "./TextField";
import { ThemeToggle } from "./ThemeToggle";
import { VisuallyHidden } from "./VisuallyHidden";

describe("Button", () => {
  it("renders the four variants as buttons", () => {
    renderWithProviders(
      <>
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
      </>,
    );
    expect(screen.getAllByRole("button")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Primary" })).toHaveAttribute("type", "button");
  });

  it("when loading: aria-busy, stays focusable, ignores clicks", async () => {
    const onClick = vi.fn();
    renderWithProviders(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).not.toBeDisabled();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("Field / TextField", () => {
  it("links label, hint and error with aria-describedby and aria-invalid", () => {
    renderWithProviders(
      <TextField id="email" label="Email" hint="We never share it" error="Enter an email" />,
    );
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("id", "email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "email-hint email-error");
    expect(input).toHaveAccessibleDescription(/We never share it.*Enter an email/);
  });

  it("marks optional fields in the label", () => {
    renderWithProviders(<TextField label="Phone" optional />);
    expect(screen.getByLabelText("Phone (optional)")).toBeInTheDocument();
  });
});

describe("PasswordField", () => {
  it("toggles visibility with an accessible button and allows paste", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PasswordField id="pw" label="Password" autoComplete="current-password" />);
    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("autocomplete", "current-password");

    await user.click(input);
    await user.paste("pasted-secret-value");
    expect(input).toHaveValue("pasted-secret-value");

    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(input).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input).toHaveAttribute("type", "password");
  });
});

describe("ErrorSummary", () => {
  function Form() {
    const [attempt, setAttempt] = useState(0);
    const [errors, setErrors] = useState<{ fieldId?: string; message: string }[]>([]);
    return (
      <>
        <ErrorSummary items={errors} focusKey={attempt} />
        <TextField id="name" label="Name" />
        <Button
          onClick={() => {
            setErrors([
              { fieldId: "name", message: "Enter your name" },
              { message: "Something else" },
            ]);
            setAttempt((a) => a + 1);
          }}
        >
          Submit
        </Button>
      </>
    );
  }

  it("takes focus after a failed submit and links to the field", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Form />);
    await user.click(screen.getByRole("button", { name: "Submit" }));

    const summary = screen.getByRole("alert");
    await waitFor(() => expect(summary).toHaveFocus());
    expect(summary).toHaveAccessibleName("There is a problem");

    await user.click(screen.getByRole("link", { name: "Enter your name" }));
    expect(screen.getByLabelText("Name")).toHaveFocus();
    expect(screen.getByText("Something else")).toBeInTheDocument();
  });

  it("renders nothing without errors", () => {
    const { container } = renderWithProviders(<ErrorSummary items={[]} focusKey={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("Alert and Badge", () => {
  it("Alert announces its tone to screen readers (never colour alone)", () => {
    renderWithProviders(
      <Alert tone="danger" title="Payment failed" role="alert">
        Try again.
      </Alert>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Error:Payment failedTry again.");
  });

  it("Badge shows an icon and a label", () => {
    renderWithProviders(<Badge tone="success">Verified</Badge>);
    const badge = screen.getByText("Verified").parentElement!;
    expect(badge.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("LanguageSwitcher", () => {
  it("changes the language and the <html lang> attribute", async () => {
    const user = userEvent.setup();
    const { i18n } = renderWithProviders(<LanguageSwitcher />);
    expect(document.documentElement.lang).toBe("en");
    await user.selectOptions(screen.getByLabelText("Language"), "fr");
    expect(i18n.language).toBe("fr");
    expect(document.documentElement.lang).toBe("fr");
    expect(screen.getByLabelText("Langue")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Ikinyarwanda" })).toHaveAttribute("lang", "rw");
  });
});

describe("ThemeToggle", () => {
  it("applies and remembers the theme via data-theme", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ThemeToggle />);
    expect(screen.getByRole("radio", { name: "System" })).toBeChecked();
    expect(document.documentElement.dataset.theme).toBeUndefined();

    await user.click(screen.getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem("medilink.theme")).toBe("dark");

    await user.click(screen.getByRole("radio", { name: "System" }));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(window.localStorage.getItem("medilink.theme")).toBeNull();
  });
});

describe("misc components", () => {
  it("SkipLink targets the main content", () => {
    renderWithProviders(<SkipLink />);
    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute(
      "href",
      "#main-content",
    );
  });

  it("Spinner with a label is a status", () => {
    renderWithProviders(<Spinner label="Loading patients" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading patients");
  });

  it("Logo has an accessible name and uses the generated brand assets", () => {
    renderWithProviders(<Logo />);
    // One accessible name, whichever theme variant CSS shows.
    const logo = screen.getByRole("img", { name: "MediLink Rwanda" });
    const sources = Array.from(logo.querySelectorAll("img")).map((img) => img.getAttribute("src"));
    expect(sources).toEqual([
      "/brand/medilink-logo-horizontal-color-120.png",
      "/brand/medilink-logo-horizontal-white-120.png",
    ]);
  });

  it("Logo on deep forest uses the white asset", () => {
    renderWithProviders(<Logo tone="onDark" />);
    expect(screen.getByRole("img", { name: "MediLink Rwanda" })).toHaveAttribute(
      "src",
      "/brand/medilink-logo-horizontal-white-120.png",
    );
  });

  it("composed form has no axe violations", async () => {
    const { container } = renderWithProviders(
      <main>
        <SkipLink />
        <Card as="section" aria-labelledby="title">
          <h1 id="title">Form</h1>
          <ErrorSummary items={[{ fieldId: "e", message: "Enter an email" }]} focusKey={1} />
          <TextField id="e" label="Email" error="Enter an email" autoComplete="email" />
          <PasswordField label="Password" autoComplete="current-password" />
          <CheckboxField label="I agree" hint="Required" />
          <LanguageSwitcher />
          <ThemeToggle />
          <Badge tone="info">Waiting</Badge>
          <Alert tone="success" title="Saved" />
          <VisuallyHidden>Hidden text</VisuallyHidden>
          <Button type="submit">Continue</Button>
        </Card>
      </main>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
