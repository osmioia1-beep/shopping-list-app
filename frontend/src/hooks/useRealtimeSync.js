import { useEffect, useRef, useState } from "react";
import { supabase } from "../services/supabase.js";

export function useRealtimeSync(userId, onReload) {
  const [syncConnected, setSyncConnected] = useState(false);
  const onReloadRef = useRef(onReload);
  onReloadRef.current = onReload;

  useEffect(() => {
    if (!userId) return;

    let active = true;
    let pending;
    const refresh = () => {
      clearTimeout(pending);
      pending = setTimeout(() => {
        if (active) onReloadRef.current();
      }, 120);
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const channel = supabase
      .channel(`shopping-list:user:${userId}`, { config: { private: true } })
      .on("broadcast", { event: "refresh" }, refresh)
      .subscribe(status => {
        if (!active) return;
        setSyncConnected(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") refresh();
      });

    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      active = false;
      clearTimeout(pending);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return syncConnected;
}
