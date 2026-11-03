/* eslint-disable */
/**
 * MediLink web push handlers (contract sprint-09 §6.2, security 06 §6), loaded by the generated
 * Workbox service worker through `importScripts` (pwa.config.ts, [S9] block).
 *
 * - push: show the notification from the JSON payload {v, id, title, body, url, tag, priority};
 *   critical ones stay on screen (requireInteraction) and alert again (renotify).
 * - notificationclick: focus an open MediLink window or open the URL, but only a same-origin path
 *   under /dashboard/notifications/ or the older /notifications/ (never an external link from a
 *   payload; the app redirects the older one).
 * - pushsubscriptionchange: nothing to fetch here; the app re-syncs on its next start.
 * This worker makes no requests and caches nothing.
 */
(function () {
  "use strict";

  var ICON = "/icon-192.png";
  var BADGE = "/favicon-32.png";

  /** The payload URL as a same-origin inbox path, or the inbox. */
  function safeUrl(raw) {
    try {
      var url = new URL(String(raw || ""), self.location.origin);
      if (
        url.origin === self.location.origin &&
        /^\/(dashboard\/)?notifications(\/|$)/.test(url.pathname)
      ) {
        return url.pathname + url.search;
      }
    } catch (error) {
      // fall through
    }
    return "/notifications";
  }

  function parse(event) {
    if (!event.data) return null;
    try {
      var data = event.data.json();
      return data && typeof data === "object" ? data : null;
    } catch (error) {
      return null;
    }
  }

  self.addEventListener("push", function (event) {
    var data = parse(event);
    if (!data || typeof data.title !== "string") return;
    var critical = data.priority === "critical";
    var options = {
      body: typeof data.body === "string" ? data.body : "",
      tag: typeof data.tag === "string" && data.tag ? data.tag : String(data.id || ""),
      lang: typeof data.lang === "string" ? data.lang : undefined,
      icon: ICON,
      badge: BADGE,
      data: { url: safeUrl(data.url) },
      requireInteraction: critical,
      renotify: critical && Boolean(data.tag || data.id),
    };
    event.waitUntil(self.registration.showNotification(data.title, options));
  });

  self.addEventListener("notificationclick", function (event) {
    event.notification.close();
    var path = safeUrl(event.notification.data && event.notification.data.url);
    event.waitUntil(
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
        for (var i = 0; i < list.length; i += 1) {
          var client = list[i];
          if (new URL(client.url).origin === self.location.origin && "focus" in client) {
            return client.focus().then(function (focused) {
              return focused && "navigate" in focused ? focused.navigate(path) : focused;
            });
          }
        }
        return self.clients.openWindow(path);
      }),
    );
  });

  self.addEventListener("pushsubscriptionchange", function () {
    // Nothing to fetch: the app re-posts its subscription on the next start.
  });
})();
