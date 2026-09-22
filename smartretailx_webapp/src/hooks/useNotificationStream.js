import { useEffect, useRef, useState } from "react";
import {
  buildNotificationStreamUrl,
  getUnreadCount,
} from "../services/notificationService";

const POLL_INTERVAL_MS = 30_000;
const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;

/**
 * Subscribe to live notifications for a customer.
 *
 * Uses SSE for instant delivery, plus a low-frequency poll as a safety net.
 * This guarantees the badge updates even when SSE is blocked by a proxy,
 * the tab was backgrounded, or the network blipped.
 *
 * @param {string|undefined} customerId
 * @param {{
 *   onCreated?: (n: object) => void,
 *   onUpdated?: (n: object) => void,
 *   onUnreadCount?: (n: number) => void,
 *   onConnectionChange?: (connected: boolean) => void,
 * }} handlers
 */
export function useNotificationStream(customerId, handlers = {}) {
  const createdRef = useRef(handlers.onCreated);
  const updatedRef = useRef(handlers.onUpdated);
  const countRef = useRef(handlers.onUnreadCount);
  const connRef = useRef(handlers.onConnectionChange);

  createdRef.current = handlers.onCreated;
  updatedRef.current = handlers.onUpdated;
  countRef.current = handlers.onUnreadCount;
  connRef.current = handlers.onConnectionChange;

  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!customerId) {
      setConnected(false);
      connRef.current?.(false);
      return;
    }

    let es = null;
    let pollTimer = null;
    let reconnectTimer = null;
    let attempt = 0;
    let stopped = false;

    const openStream = () => {
      if (stopped) return;
      try {
        es = new EventSource(buildNotificationStreamUrl(customerId));
      } catch (err) {
        console.warn("[SSE] failed to open stream:", err);
        scheduleReconnect();
        return;
      }

      es.addEventListener("notification", (e) => {
        try {
          const n = JSON.parse(e.data);
          createdRef.current?.(n);
          // bump the badge immediately, without waiting for a poll
          pollOnce();
        } catch (err) {
          console.warn("[SSE] bad payload", err);
        }
      });

      es.addEventListener("updated", (e) => {
        try {
          const n = JSON.parse(e.data);
          updatedRef.current?.(n);
        } catch (err) {
          console.warn("[SSE] bad payload", err);
        }
      });

      es.onopen = () => {
        attempt = 0;
        setConnected(true);
        connRef.current?.(true);
      };

      es.onerror = () => {
        setConnected(false);
        connRef.current?.(false);

        // EventSource reconnects automatically for transient errors, but if
        // the browser has given up (readyState CLOSED) we must recreate it.
        if (es && es.readyState === EventSource.CLOSED) {
          scheduleReconnect();
        }
      };
    };

    const scheduleReconnect = () => {
      if (stopped) return;
      const delay = Math.min(
        RECONNECT_BASE_MS * Math.pow(2, attempt),
        RECONNECT_MAX_MS
      );
      attempt += 1;
      reconnectTimer = setTimeout(() => {
        if (es) {
          try {
            es.close();
          } catch {
            /* ignore */
          }
          es = null;
        }
        openStream();
      }, delay);
    };

    const pollOnce = async () => {
      try {
        const res = await getUnreadCount(customerId);
        const unread = res?.data?.data?.unread ?? 0;
        countRef.current?.(unread);
      } catch (err) {
        // silent — polling is best-effort
      }
    };

    // Initial load + periodic safety net
    pollOnce();
    pollTimer = setInterval(pollOnce, POLL_INTERVAL_MS);

    // Reconnect when the tab becomes visible again
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (!es || es.readyState === EventSource.CLOSED) {
        if (es) {
          try {
            es.close();
          } catch {
            /* ignore */
          }
          es = null;
        }
        attempt = 0;
        openStream();
      }
      pollOnce();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onVisibility);

    openStream();

    return () => {
      stopped = true;
      if (pollTimer) clearInterval(pollTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onVisibility);
      if (es) {
        try {
          es.close();
        } catch {
          /* ignore */
        }
      }
    };
  }, [customerId]);

  return { connected };
}