import {
  createApiClient,
  createMediLinkApi,
  isApiError,
  type MediLinkApi,
} from "@medilink/api-client";
import { ThemeProvider } from "@medilink/ui";
import type { Language } from "@medilink/ui/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { i18n as I18n } from "i18next";
import { createContext, useContext, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import { patientMeKey } from "../auth/queries";
import { env } from "../env";
import { createPatientI18n } from "../i18n";

export interface AppServices {
  api: MediLinkApi;
  queryClient: QueryClient;
  i18n: I18n;
}

const ServicesContext = createContext<AppServices | null>(null);

export interface CreateServicesOptions {
  language?: Language;
  persistLanguage?: boolean;
  apiBaseUrl?: string;
}

/** Everything the app needs, created once in main.tsx (and per test). */
export function createServices(options: CreateServicesOptions = {}): AppServices {
  const i18n = createPatientI18n({
    ...(options.language ? { language: options.language } : {}),
    persist: options.persistLanguage ?? true,
  });
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) =>
          failureCount < 2 && (!isApiError(error) || error.status === 0 || error.status >= 500),
        refetchOnWindowFocus: false,
        staleTime: 30_000,
      },
      mutations: { retry: false },
    },
  });
  const api = createMediLinkApi(
    createApiClient({
      baseUrl: options.apiBaseUrl ?? env.apiBaseUrl,
      getLanguage: () => i18n.resolvedLanguage ?? i18n.language,
      onUnauthorized: () => {
        void queryClient.resetQueries({ queryKey: patientMeKey });
      },
    }),
  );
  return { api, queryClient, i18n };
}

export function AppProviders({
  services,
  children,
}: {
  services: AppServices;
  children: ReactNode;
}) {
  return (
    <ServicesContext.Provider value={services}>
      <I18nextProvider i18n={services.i18n}>
        <QueryClientProvider client={services.queryClient}>
          <ThemeProvider>{children}</ThemeProvider>
        </QueryClientProvider>
      </I18nextProvider>
    </ServicesContext.Provider>
  );
}

export function useServices(): AppServices {
  const services = useContext(ServicesContext);
  if (!services) throw new Error("useServices must be used inside <AppProviders>");
  return services;
}

export function useApi(): MediLinkApi {
  return useServices().api;
}
