import type { ComponentType } from "react";

import type { FeatureRoutes } from "../../app/features";
import { SetupTodayCard } from "./ChecklistPage";
import { LeaveTodayCard } from "./TodayCards";

const lazy =
  <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

const settings = () => import("./SettingsPages");
const billing = () => import("./BillingPages");
const schedules = () => import("./SchedulesPage");
const staff = () => import("./StaffPage");

/** S2 `setup`: facility setup, settings, schedules, billing setup and staff (contract §6.1). */
export const setupFeature: FeatureRoutes = {
  public: [{ path: "/invite/:token", lazy: lazy(() => import("./InvitePage"), "InvitePage") }],
  shell: [
    { path: "/setup", lazy: lazy(() => import("./ChecklistPage"), "ChecklistPage") },
    { path: "/settings", lazy: lazy(settings, "SettingsHomePage") },
    { path: "/settings/profile", lazy: lazy(settings, "ProfilePage") },
    { path: "/settings/services", lazy: lazy(() => import("./CataloguePage"), "CataloguePage") },
    { path: "/settings/hours", lazy: lazy(() => import("./HoursPage"), "HoursPage") },
    { path: "/settings/schedules", lazy: lazy(schedules, "SchedulesPage") },
    { path: "/schedule/mine", lazy: lazy(schedules, "MySchedulePage") },
    { path: "/settings/tariffs", lazy: lazy(billing, "TariffsPage") },
    { path: "/settings/insurers", lazy: lazy(billing, "InsurersPage") },
    { path: "/settings/rules", lazy: lazy(settings, "RulesPage") },
    { path: "/settings/history", lazy: lazy(settings, "HistoryPage") },
    { path: "/staff", lazy: lazy(staff, "StaffPage") },
    { path: "/profile/clinician", lazy: lazy(staff, "ClinicianPage") },
  ],
  todayCards: [SetupTodayCard, LeaveTodayCard],
};
