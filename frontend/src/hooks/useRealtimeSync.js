import { useEffect, useRef, useState } from "react";
import { supabase } from "../services/supabase.js";

/**
 * Hook that subscribes to Supabase Realtime changes for a given list.
 * Subscribes to ALL changes (INSERT, UPDATE, DELETE) on items, lists, and purchase_history.
 * Also shows a sync indicator in the UI.
 */
export function useRealtimeSync(listId, onReload) {
  const [syncConnected, setSyncConnected] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const onReloadRef = useRef(onReload);
  onReloadRef.current = onReload;

  useEffect(() => {
    if (!listId) return;

    const channelName = `realtime:list:${listId}`;

    console.log("[Realtime] Subscribing to channel:", channelName, "listId:", listId);

    const channel = supabase
      .channel(channelName)
      // Subscribe to ALL item changes (INSERT, UPDATE, DELETE) for this list
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "items",
          filter: `list_id=eq.${listId}`,
        },
        (payload) => {
          console.log("[Realtime] Items change:", payload.eventType, payload.new, payload.old);
          if (onReloadRef.current) {
            onReloadRef.current();
          }
          setLastSyncAt(new Date());
        }
      )
      // Subscribe to ALL list changes (INSERT, UPDATE, DELETE)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lists",
        },
        (payload) => {
          console.log("[Realtime] Lists change:", payload.eventType, payload.new, payload.old);
          if (onReloadRef.current) {
            onReloadRef.current();
          }
          setLastSyncAt(new Date());
        }
      )
      // Subscribe to ALL history changes (for stats sync)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "purchase_history",
          filter: `list_id=eq.${listId}`,
        },
        (payload) => {
          console.log("[Realtime] History change:", payload.eventType);
          if (onReloadRef.current) {
            onReloadRef.current();
          }
          setLastSyncAt(new Date());
        }
      )
      .subscribe((status, err) => {
        console.log("[Realtime] Subscribe status:", status, err || "");
        if (status === "SUBSCRIBED") {
          setSyncConnected(true);
          console.log("[Realtime] ✅ Connected!");
        } else if (status === "CHANNEL_ERROR") {
          setSyncConnected(false);
          console.error("[Realtime] ❌ Channel error:", err);
        } else if (status === "TIMED_OUT") {
          setSyncConnected(false);
          console.error("[Realtime] ⏰ Timed out");
        }
      });

    return () => {
      console.log("[Realtime] Unsubscribing from channel:", channelName);
      supabase.removeChannel(channel).then(() => {
        setSyncConnected(false);
      });
    };
  }, [listId]);

  return { syncConnected, lastSyncAt };
}
