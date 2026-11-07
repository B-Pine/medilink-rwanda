import { redirect, type RouteObject } from "react-router";

/**
 * Addresses of the signed-in patient app (upgrade 12 §2): every page lives under `/dashboard`.
 * Links use these builders, never hand-written strings, so a move happens in one place.
 */
export const DASHBOARD = "/dashboard";

export const paths = {
  overview: DASHBOARD,
  findCare: `${DASHBOARD}/find-care`,
  facilities: `${DASHBOARD}/facilities`,
  facility: (slug: string) => `${DASHBOARD}/facilities/${slug}`,
  book: (slug: string) => `${DASHBOARD}/book/${slug}`,
  appointments: `${DASHBOARD}/appointments`,
  appointment: (id: string) => `${DASHBOARD}/appointments/${id}`,
  queue: `${DASHBOARD}/queue`,
  ticket: (visitId: string) => `${DASHBOARD}/queue/${visitId}`,
  family: `${DASHBOARD}/family`,
  member: (patientId: string) => `${DASHBOARD}/family/${patientId}`,
  profile: `${DASHBOARD}/profile`,
  profileOf: (patientId: string) => `${DASHBOARD}/profile/${patientId}`,
  claim: `${DASHBOARD}/claim`,
  privacy: `${DASHBOARD}/privacy`,
  records: `${DASHBOARD}/records`,
  record: (id: string) => `${DASHBOARD}/records/${id}`,
  medications: `${DASHBOARD}/medications`,
  medication: (id: string) => `${DASHBOARD}/medications/${id}`,
  documents: `${DASHBOARD}/documents`,
  document: (id: string) => `${DASHBOARD}/documents/${id}`,
  bills: `${DASHBOARD}/bills`,
  bill: (id: string) => `${DASHBOARD}/bills/${id}`,
  notifications: `${DASHBOARD}/notifications`,
  notification: (id: string) => `${DASHBOARD}/notifications/${id}`,
  notificationSettings: `${DASHBOARD}/notifications/settings`,
  settings: `${DASHBOARD}/settings`,
  help: `${DASHBOARD}/help`,
  article: (slug: string) => `${DASHBOARD}/help/articles/${slug}`,
  requests: `${DASHBOARD}/help/requests`,
  newRequest: `${DASHBOARD}/help/requests/new`,
  request: (id: string) => `${DASHBOARD}/help/requests/${id}`,
} as const;

/**
 * Old addresses (design 07) and where they live now. Emails, push messages, calendar files and
 * bookmarks still carry them, so each one redirects, keeping the rest of the path and the query.
 */
const LEGACY: [from: string, to: string][] = [
  ["/home", paths.overview],
  ["/visits", paths.queue],
  ["/book", `${DASHBOARD}/book`],
  ["/records", paths.records],
  ["/medicines", paths.medications],
  ["/documents", paths.documents],
  ["/bills", paths.bills],
  ["/family", paths.family],
  ["/profile", paths.profile],
  ["/privacy/settings", paths.privacy],
  ["/claim", paths.claim],
  ["/notifications", paths.notifications],
  ["/support", paths.help],
  ["/settings", paths.settings],
];

export const legacyRoutes: RouteObject[] = LEGACY.flatMap(([from, to]) => [
  { path: from, loader: ({ request }) => redirect(to + new URL(request.url).search) },
  {
    path: `${from}/*`,
    loader: ({ request, params }) =>
      redirect(`${to}/${params["*"] ?? ""}${new URL(request.url).search}`),
  },
]);
