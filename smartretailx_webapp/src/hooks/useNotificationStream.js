import { useEffect, useRef } from "react";
import { API_URLS } from "../services/config";

/**
 * Subscribe to live notifications for a customer via SSE.
 * EventSource auto-reconnects when the connection drops.
 */
export function useNotificationStream(customerId, { onCreated, onUpdated } = {}) {
  const createdRef = useRef(onCreated);
  const updatedRef = useRef(onUpdated);
  createdRef.current = onCreated;
  updatedRef.current = onUpdated;

  useEffect(() => {
    if (!customerId) return;

    const url =
      `${API_URLS.notification}/api/v1/notifications/stream` +
      `?customerId=${encodeURIComponent(customerId)}`;

    const es = new EventSource(url);

    es.addEventListener("notification", (e) => {
      try {
        createdRef.current?.(JSON.parse(e.data));
      } catch (err) {
        console.warn("Bad SSE payload", err);
      }
    });

    es.addEventListener("updated", (e) => {
      try {
        updatedRef.current?.(JSON.parse(e.data));
      } catch (err) {
        console.warn("Bad SSE payload", err);
      }
    });

    es.onerror = () => {
      // EventSource will retry automatically; log once.
      // (Browsers also log this themselves.)
    };

    return () => es.close();
  }, [customerId]);
}