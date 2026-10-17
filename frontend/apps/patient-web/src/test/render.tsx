import type { Language } from "@medilink/ui/i18n";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";

import { routes } from "../app/routes";
import { AppProviders, createServices } from "../app/services";

/** Render the whole patient app at a path, against the MSW contract mocks. */
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
