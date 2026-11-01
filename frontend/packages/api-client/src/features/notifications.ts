/**
 * S9 notification engine (contract sprint-09 §3.3, §3.4): inboxes, unread counts, preferences,
 * push subscriptions, facility and platform announcements, templates and the delivery log, plus
 * the notification sockets. Shapes follow `backend/medilink/notifications/serializers.py`.
 */
import type { ApiClient } from "../client";
import type { LanguageCode, Uuid } from "../types";
import { query, type ListParams, type Page } from "./masterdata";
import { connectLive, socketUrl, type LiveConnection, type LiveStatus } from "../realtime";

declare module "../types" {
  interface PermissionCodes {
    "announcements.manage": true;
  }
}

export type NotificationAudience = "patient" | "staff";
export type NotificationPriority = "critical" | "important" | "routine";
export type NotificationChannel = "in_app" | "web_push" | "email" | (string & {});

export interface NotificationFacilityRef {
  id: Uuid;
  name: string;
}

/** One inbox item; `data` holds IDs only (notify-then-fetch). */
export interface AppNotification {
  id: Uuid;
  event_type: string;
  priority: NotificationPriority;
  language: LanguageCode;
  title: string;
  body: string;
  /** In-app path (starts with `/`), or null. */
  action_path: string | null;
  /** Who it is about (a dependent for guardians), or null. */
  patient_id: Uuid | null;
  facility: NotificationFacilityRef | null;
  data: Record<string, string>;
  is_read: boolean;
  read_at: string | null;
  is_withdrawn: boolean;
  created_at: string;
}

export interface UnreadCount {
  unread: number;
  /** Staff only: unread items of the user's other facilities. */
  other_facilities?: { facility_id: Uuid; unread: number }[];
}

export interface InboxParams extends ListParams {
  is_read?: boolean;
  /** Patient only: a linked profile. */
  patient_id?: Uuid;
  page?: number;
  page_size?: number;
}

export interface ChannelsByPriority {
  critical: NotificationChannel[];
  important: NotificationChannel[];
  routine: NotificationChannel[];
}

export interface QuietHours {
  is_enabled: boolean;
  /** "HH:MM", Africa/Kigali. */
  start: string;
  end: string;
}

export interface DependentAlerts {
  patient_id: Uuid;
  display_name: string;
  relationship: "guardian" | "delegate" | (string & {});
  receive_alerts: boolean;
}

/** `version: 0` = defaults (nothing saved yet). */
export interface PatientNotificationPreferences {
  language: LanguageCode;
  /** From the adapter registry; in-app is always on and never listed. */
  available_channels: NotificationChannel[];
  channels: ChannelsByPriority;
  quiet_hours: QuietHours;
  reminder_offsets_minutes: number[];
  dependents: DependentAlerts[];
  /** Critical can't be emptied while a ticket is active (S4 hook). */
  is_critical_locked: boolean;
  version: number;
}

export interface PatientPreferencesPatch {
  version: number;
  language?: LanguageCode;
  channels?: ChannelsByPriority;
  quiet_hours?: QuietHours;
  reminder_offsets_minutes?: number[];
  dependents?: { patient_id: Uuid; receive_alerts: boolean }[];
}

export type ApprovalsDigest = "immediate" | "daily";

export interface StaffNotificationPreferences {
  language: LanguageCode;
  sound_enabled: boolean;
  approvals_digest: ApprovalsDigest;
  version: number;
}

export interface StaffPreferencesPatch {
  version: number;
  language?: LanguageCode;
  sound_enabled?: boolean;
  approvals_digest?: ApprovalsDigest;
}

/** `PushSubscription.toJSON()` in snake_case. */
export interface PushSubscriptionRequest {
  endpoint: string;
  expiration_time?: number | null;
  keys: { p256dh: string; auth: string };
}

export interface PushSubscriptionRow {
  id: Uuid;
  label: string;
  endpoint_host: string;
  created_at: string;
  last_success_at: string | null;
}

export interface WebPushKey {
  public_key: string | null;
  is_enabled: boolean;
}

export type FacilityAnnouncementAudience = "patients_in_range" | "display";
export type PlatformAnnouncementAudience = "all_facilities" | "selected_facilities";
export type AnnouncementAudience = FacilityAnnouncementAudience | PlatformAnnouncementAudience;
export type AnnouncementStatus = "draft" | "published" | "withdrawn";
export type AnnouncementPriority = "routine" | "important";
export type AnnouncementText = Partial<Record<LanguageCode, string>>;

export interface Announcement {
  id: Uuid;
  facility_id: Uuid | null;
  audience: AnnouncementAudience;
  target_facility_ids: Uuid[] | null;
  range_starts_on: string | null;
  range_ends_on: string | null;
  priority: AnnouncementPriority;
  title_i18n: AnnouncementText;
  body_i18n: AnnouncementText;
  starts_at: string | null;
  ends_at: string | null;
  status: AnnouncementStatus;
  recipient_count: number | null;
  created_by: { id: Uuid; full_name: string };
  published_at: string | null;
  withdrawn_at: string | null;
  version: number;
  created_at: string;
}

export interface AnnouncementInput {
  audience: AnnouncementAudience;
  target_facility_ids?: Uuid[] | null;
  range_starts_on?: string | null;
  range_ends_on?: string | null;
  priority?: AnnouncementPriority;
  title_i18n: AnnouncementText;
  body_i18n: AnnouncementText;
  starts_at?: string | null;
  ends_at?: string | null;
}

export type AnnouncementPatch = Partial<AnnouncementInput> & { version: number };

/** Title and body limits per language (contract §3.3). */
export const ANNOUNCEMENT_LIMITS = { title: 120, body: 1000 } as const;

export type AttemptStatus =
  "queued" | "held" | "skipped" | "sent" | "delivered" | "read" | "failed" | "cancelled";

export interface DeliveryLogEntry {
  notification_id: Uuid;
  event_type: string;
  priority: NotificationPriority;
  recipient_user_id: Uuid;
  patient_id: Uuid | null;
  template: { code: string; version: number; language: LanguageCode };
  title: string;
  created_at: string;
  read_at: string | null;
  attempts: {
    channel: NotificationChannel;
    attempt_no: number;
    is_fallback: boolean;
    status: AttemptStatus;
    failure_reason: string | null;
    queued_at: string;
    sent_at: string | null;
  }[];
}

export interface NotificationTemplate {
  id: Uuid;
  code: string;
  channel: NotificationChannel;
  language: LanguageCode;
  variant: "self" | "dependent";
  template_version: number;
  subject: string;
  body: string;
  placeholders: string[];
  allowed_placeholders: string[];
  limits: { subject?: number; body?: number };
  is_active: boolean;
  source: "seed" | "platform";
  created_by: { id: Uuid; full_name: string } | null;
  created_at: string;
}

export interface DeliveryStats {
  since: string;
  by_channel: {
    channel: NotificationChannel;
    sent: number;
    failed: number;
    skipped: number;
    held: number;
    cancelled: number;
  }[];
  failure_reasons: { reason: string; count: number }[];
  push_opt_in: { patient_accounts: number; with_active_subscription: number };
}

const v1 = "/api/v1";

const inboxPaths = (audience: NotificationAudience) => ({
  list: `${v1}/${audience}/notifications/`,
  detail: (id: Uuid) => `${v1}/${audience}/notifications/${id}/`,
  count: `${v1}/${audience}/notifications/unread-count/`,
  read: (id: Uuid) => `${v1}/${audience}/notifications/${id}/read/`,
  readAll: `${v1}/${audience}/notifications/read-all/`,
  preferences: `${v1}/${audience}/notification-preferences/`,
});

const announcementPaths = (base: string) => ({
  list: `${base}/announcements/`,
  detail: (id: Uuid) => `${base}/announcements/${id}/`,
  publish: (id: Uuid) => `${base}/announcements/${id}/publish/`,
  withdraw: (id: Uuid) => `${base}/announcements/${id}/withdraw/`,
});

export const notificationsPaths = {
  webPushKey: `${v1}/public/web-push-key/`,
  patient: {
    ...inboxPaths("patient"),
    pushSubscriptions: `${v1}/patient/push-subscriptions/`,
    pushSubscription: (id: Uuid) => `${v1}/patient/push-subscriptions/${id}/`,
  },
  staff: {
    ...inboxPaths("staff"),
    announcements: announcementPaths(`${v1}/staff`),
    deliveries: `${v1}/staff/notification-deliveries/`,
  },
  platform: {
    announcements: announcementPaths(`${v1}/platform`),
    templates: `${v1}/platform/notification-templates/`,
    template: (id: Uuid, action?: "revise" | "activate") =>
      `${v1}/platform/notification-templates/${id}/${action ? `${action}/` : ""}`,
    deliveries: `${v1}/platform/notification-deliveries/`,
    stats: `${v1}/platform/notification-deliveries/stats/`,
  },
} as const;

/** WebSocket paths (contract §3.4). */
export const notificationSockets: Record<NotificationAudience, string> = {
  patient: "/ws/v1/patient/notifications/",
  staff: "/ws/v1/staff/notifications/",
};

function inboxApi(client: ApiClient, audience: NotificationAudience) {
  const p = inboxPaths(audience);
  return {
    list: (params: InboxParams = {}) => client.get<Page<AppNotification>>(p.list + query(params)),
    get: (id: Uuid) => client.get<AppNotification>(p.detail(id)),
    unreadCount: () => client.get<UnreadCount>(p.count),
    markRead: (id: Uuid) => client.post<AppNotification>(p.read(id)),
    /** `before`: only items created up to this time (what the user saw). */
    markAllRead: (before?: string) =>
      client.post<{ marked: number }>(p.readAll, before ? { before } : {}),
  };
}

function announcementsApi(client: ApiClient, base: string) {
  const p = announcementPaths(base);
  return {
    list: (params: { status?: AnnouncementStatus; page?: number } = {}) =>
      client.get<Page<Announcement>>(p.list + query(params)),
    get: (id: Uuid) => client.get<Announcement>(p.detail(id)),
    create: (body: AnnouncementInput) => client.post<Announcement>(p.list, body),
    update: (id: Uuid, body: AnnouncementPatch) =>
      client.request<Announcement>("PATCH", p.detail(id), { body }),
    publish: (id: Uuid) => client.post<Announcement>(p.publish(id)),
    withdraw: (id: Uuid) => client.post<Announcement>(p.withdraw(id)),
  };
}

export function createNotificationsApi(client: ApiClient) {
  const patient = notificationsPaths.patient;
  const platform = notificationsPaths.platform;
  return {
    public: {
      webPushKey: () => client.get<WebPushKey>(notificationsPaths.webPushKey),
    },
    patient: {
      ...inboxApi(client, "patient"),
      preferences: () => client.get<PatientNotificationPreferences>(patient.preferences),
      updatePreferences: (body: PatientPreferencesPatch) =>
        client.request<PatientNotificationPreferences>("PATCH", patient.preferences, { body }),
      pushSubscriptions: () => client.get<PushSubscriptionRow[]>(patient.pushSubscriptions),
      /** 201 new, 200 already yours (idempotent). */
      subscribePush: (body: PushSubscriptionRequest) =>
        client.post<PushSubscriptionRow>(patient.pushSubscriptions, body),
      removePushSubscription: (id: Uuid) =>
        client.request<void>("DELETE", patient.pushSubscription(id)),
    },
    staff: {
      ...inboxApi(client, "staff"),
      preferences: () =>
        client.get<StaffNotificationPreferences>(notificationsPaths.staff.preferences),
      updatePreferences: (body: StaffPreferencesPatch) =>
        client.request<StaffNotificationPreferences>(
          "PATCH",
          notificationsPaths.staff.preferences,
          { body },
        ),
      announcements: announcementsApi(client, `${v1}/staff`),
      deliveries: (params: ListParams = {}) =>
        client.get<Page<DeliveryLogEntry>>(notificationsPaths.staff.deliveries + query(params)),
    },
    platform: {
      announcements: announcementsApi(client, `${v1}/platform`),
      templates: (params: ListParams = {}) =>
        client.get<Page<NotificationTemplate>>(platform.templates + query(params)),
      template: (id: Uuid) => client.get<NotificationTemplate>(platform.template(id)),
      reviseTemplate: (
        id: Uuid,
        body: { subject: string; body: string; based_on_version: number },
      ) => client.post<NotificationTemplate>(platform.template(id, "revise"), body),
      activateTemplate: (id: Uuid) =>
        client.post<NotificationTemplate>(platform.template(id, "activate")),
      deliveries: (params: ListParams = {}) =>
        client.get<Page<DeliveryLogEntry>>(platform.deliveries + query(params)),
      stats: (since?: string) =>
        client.get<DeliveryStats>(platform.stats + query({ since: since ?? null })),
    },
  };
}

export type NotificationsApi = ReturnType<typeof createNotificationsApi>;

// ---- Sockets (contract §3.4) -------------------------------------------------------------------

export type NotificationSocketMessage =
  | {
      type: "notification.created";
      data: {
        id: Uuid;
        priority: NotificationPriority;
        patient_id: Uuid | null;
        facility_id?: Uuid | null;
      };
    }
  | { type: "notification.read"; data: { ids: Uuid[] } | { all: true } }
  | { type: "notification.updated"; data: { id: Uuid } };

const SOCKET_TYPES = new Set(["notification.created", "notification.read", "notification.updated"]);

export interface NotificationSocketOptions {
  /** API origin (VITE_API_BASE_URL). */
  baseUrl: string;
  audience: NotificationAudience;
  onMessage: (message: NotificationSocketMessage) => void;
  onStatus?: (status: LiveStatus) => void;
  /** Called after the socket comes back from a drop: refetch the count (messages may be lost). */
  onReconnect?: () => void;
  /** For tests. */
  WebSocketImpl?: typeof WebSocket;
}

/**
 * The notification socket, on the S4 `connectLive` helper: `ping` every 25 s, reconnect with
 * backoff 1 s → 30 s and jitter, stop on 4401. Unknown messages are ignored. Returns `close()`.
 */
export function connectNotificationSocket(options: NotificationSocketOptions): LiveConnection {
  let wasLive = false;
  let dropped = false;
  return connectLive(socketUrl(options.baseUrl, notificationSockets[options.audience]), {
    ...(options.WebSocketImpl ? { WebSocketImpl: options.WebSocketImpl } : {}),
    onStatus: (status) => {
      if (status === "live") {
        if (wasLive && dropped) options.onReconnect?.();
        wasLive = true;
        dropped = false;
      } else if (wasLive) {
        dropped = true;
      }
      options.onStatus?.(status);
    },
    onMessage: (message) => {
      if (SOCKET_TYPES.has(message.type) && typeof message.data === "object" && message.data) {
        options.onMessage(message as unknown as NotificationSocketMessage);
      }
    },
  });
}
