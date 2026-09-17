"use client";

import { useEffect, useState } from "react";
import { isOfflineMessage, requestOfflineStatus, type OfflineStatus } from "@/lib/offline-guide";

export default function useOfflineGuide() {
  const [offline, setOffline] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    let refreshing = false;
    let refreshAgain = false;
    let currentReady = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryDelay = 30_000;
    const supported = process.env.NODE_ENV === "production" && window.isSecureContext && "serviceWorker" in navigator;
    const watched = new Set<ServiceWorker>();
    const cleanups: (() => void)[] = [];
    const fail = (error: unknown) => {
      console.error("Could not prepare the offline event guide.", error);
      if (disposed || !supported || !navigator.onLine) return;
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        if (document.visibilityState === "visible") void refresh();
      }, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 300_000);
    };
    const applyStatus = (status: OfflineStatus) => {
      if (disposed) return;
      const complete = status.ready && Boolean(navigator.serviceWorker.controller);
      if (complete && !currentReady) {
        clearTimeout(retryTimer);
        retryDelay = 30_000;
      }
      currentReady = complete;
      setReady(complete);
    };
    const watch = (worker: ServiceWorker) => {
      if (watched.has(worker)) return;
      watched.add(worker);
      const changed = () => {
        if (worker.state === "installed" || worker.state === "activated") {
          clearTimeout(retryTimer);
          retryDelay = 30_000;
          void refresh();
        } else if (worker.state === "redundant") {
          fail(new Error("The offline download did not finish. Any previously saved guide has been kept."));
        }
      };
      worker.addEventListener("statechange", changed);
      cleanups.push(() => worker.removeEventListener("statechange", changed));
      changed();
    };
    const refresh = async () => {
      if (disposed || !supported) return;
      if (refreshing) {
        refreshAgain = true;
        return;
      }
      refreshing = true;
      try {
        if (registration && !registration.active && !registration.installing && !registration.waiting) registration = undefined;
        if (!registration) {
          const next = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
          if (disposed) return;
          registration = next;
          const update = () => { if (next.installing) watch(next.installing); };
          next.addEventListener("updatefound", update);
          cleanups.push(() => next.removeEventListener("updatefound", update));
          if (next.installing) watch(next.installing);
        }
        if (registration.active) {
          let status: OfflineStatus;
          try {
            status = await requestOfflineStatus(registration.active);
          } catch (error) {
            currentReady = false;
            if (!disposed) setReady(false);
            throw error;
          }
          applyStatus(status);
          if (!status.ready && navigator.onLine) {
            applyStatus(await requestOfflineStatus(registration.active, "OFFLINE_REPAIR"));
          }
        }
        if (navigator.onLine && !registration.installing && !registration.waiting) await registration.update();
      } catch (error) {
        fail(error);
        // A failed first install removes its registration. Register again on the next retry.
        if (registration && !registration.active && !registration.installing && !registration.waiting) registration = undefined;
      } finally {
        refreshing = false;
        if (refreshAgain) {
          refreshAgain = false;
          void refresh();
        }
      }
    };
    const connectionChanged = () => {
      setOffline(!navigator.onLine);
      clearTimeout(retryTimer);
      retryDelay = 30_000;
      void refresh();
    };
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    const message = ({ data, source }: MessageEvent<unknown>) => {
      if (!registration || ![registration.installing, registration.waiting, registration.active].some((worker) => worker && worker === source) ||
          !isOfflineMessage(data)) return;
      if (data.type === "OFFLINE_ERROR") {
        fail(new Error(data.message));
      } else if (data.type === "OFFLINE_STATUS" && source === registration.active) {
        applyStatus(data);
        if (!data.ready && navigator.onLine) void refresh();
      }
    };
    setOffline(!navigator.onLine);
    window.addEventListener("online", connectionChanged);
    window.addEventListener("offline", connectionChanged);
    document.addEventListener("visibilitychange", visible);
    if (supported) {
      navigator.serviceWorker.addEventListener("message", message);
      navigator.serviceWorker.addEventListener("controllerchange", refresh);
      void refresh();
    }
    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      window.removeEventListener("online", connectionChanged);
      window.removeEventListener("offline", connectionChanged);
      document.removeEventListener("visibilitychange", visible);
      if (supported) {
        navigator.serviceWorker.removeEventListener("message", message);
        navigator.serviceWorker.removeEventListener("controllerchange", refresh);
      }
      for (const cleanup of cleanups) cleanup();
    };
  }, []);

  return { offline, ready };
}
