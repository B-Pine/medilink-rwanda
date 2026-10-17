import type { Language } from "@medilink/ui/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";

import { routes } from "../app/routes";
import { AppProviders, createServices } from "../app/services";

/** Render the whole staff app at a path, against the MSW contract mocks. */
export function renderApp(path = "/", { language = "en" }: { language?: Language } = {}) {
  const services = createServices({ language, persistLanguage: false });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const user = userEvent.setup();
  const result = render(
    <AppProviders services={services}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...result, services, router, user };
}

/** Fill and submit the staff login form. */
export async function logIn(
  user: ReturnType<typeof userEvent.setup>,
  email: string,
  password: string,
) {
  await user.type(await screen.findByLabelText("Email"), email);
  await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: "Log in" }));
}
