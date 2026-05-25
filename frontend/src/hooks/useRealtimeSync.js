import { useEffect, useRef, useState } from "react";
import { supabase } from "../services/supabase.js";

/**
 * Hook that subscribes to Supabase Realtime changes for a given list.
 * When another device/client modifies items, this hook triggers a reload.
 * Also shows a sync indicator ("sincronizado" pulse).
 */
export function useRealtimeSync(listId, onReload) {
  const [syncConnected, setSyncConnected] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const onReloadRef = useRef(onReload);
  onReloadRef.current = onReload;

  useEffect(() => {
    if (!listId) return;

    // Subscribe to changes on items table for this list
    const channel = supabase
      .channel(`realtime:items:${listId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "items",
          filter: `list_id=eq.${listId}`,
        },
        (payload) => {
          // Trigger reload when another client changes data
          // Only reload if this wasn't triggered by the current user
          if (onReloadRef.current) {
            onReloadRef.current();
          }
          setLastSyncAt(new Date());
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lists",
        },
        (payload) => {
          // If lists changed (created/deleted/renamed), trigger reload
          if (onReloadRef.current && payload.eventType === "INSERT") {
            onReloadRef.current();
          }
          setLastSyncAt(new Date());
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setSyncConnected(true);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setSyncConnected(false);
        }
      });

    return () => {
      supabase.removeChannel(channel);
      setSyncConnected(false);
    };
  }, [listId]);

  return { syncConnected, lastSyncAt };
}
