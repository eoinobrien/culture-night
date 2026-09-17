"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mergeSavedUrls, MyNightDataError, myNightStorageKey, readSavedUrls, reorderSavedUrls, toggleSavedUrl } from "@/lib/my-night";

type MyNightState = {
  urls: string[];
  ready: boolean;
  persistent: boolean;
  notice?: string;
};

function storageNotice(error: unknown): string {
  if (!(error instanceof DOMException) && !(error instanceof MyNightDataError)) throw error;
  console.error("My Night could not use browser storage.", error);
  return error instanceof MyNightDataError
    ? "Your saved list could not be read and has been left unchanged. New changes are kept for this visit only."
    : "Browser storage is unavailable. My Night changes are kept for this visit only and will be lost when you leave.";
}

export default function useMyNight(year: number) {
  const key = myNightStorageKey(year);
  const tipKey = `${key}:tip-seen`;
  const [state, setState] = useState<MyNightState>({ urls: [], ready: false, persistent: false });
  const [showTip, setShowTip] = useState(false);
  const tipShown = useRef(false);
  const dismissTip = useCallback(() => setShowTip(false), []);
  const current = useRef(state);
  const publish = useCallback((next: MyNightState) => {
    current.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    tipShown.current = false;
    setShowTip(false);
    let storage: Storage;
    try {
      storage = window.localStorage;
      publish({ urls: readSavedUrls(storage, key), ready: true, persistent: true });
    } catch (error) {
      publish({ urls: [], ready: true, persistent: false, notice: storageNotice(error) });
      return;
    }
    const refresh = (event: StorageEvent) => {
      if (event.storageArea !== storage || (event.key !== key && event.key !== null) || !current.current.persistent) return;
      try {
        const urls = readSavedUrls(storage, key);
        if (!urls.length) setShowTip(false);
        publish({ urls, ready: true, persistent: true });
      } catch (error) {
        publish({ ...current.current, persistent: false, notice: storageNotice(error) });
      }
    };
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, [key, publish]);

  const update = useCallback((change: (urls: readonly string[]) => string[]) => {
    const previous = current.current;
    if (!previous.ready) {
      publish({ ...previous, notice: "My Night is still loading. Please try again shortly." });
      return;
    }
    let { urls, persistent, notice } = previous;
    let storage: Storage | undefined;
    if (persistent) {
      try {
        storage = window.localStorage;
        // Include the latest changes from other tabs before applying this action.
        urls = readSavedUrls(storage, key);
      } catch (error) {
        persistent = false;
        notice = storageNotice(error);
      }
    }
    const nextUrls = change(urls);
    if (persistent && storage) {
      try {
        storage.setItem(key, JSON.stringify(nextUrls));
      } catch (error) {
        persistent = false;
        notice = storageNotice(error);
      }
    }
    if (nextUrls.length === 0) {
      setShowTip(false);
    } else if (urls.length === 0 && !tipShown.current) {
      tipShown.current = true;
      let seen = false;
      if (persistent && storage) {
        try {
          seen = storage.getItem(tipKey) === "1";
          if (!seen) storage.setItem(tipKey, "1");
        } catch (error) {
          if (!(error instanceof DOMException)) throw error;
          console.warn("Could not remember the My Night tip. It may appear again on a later visit.", error);
        }
      }
      if (!seen) setShowTip(true);
    }
    publish({ urls: nextUrls, ready: true, persistent, notice });
  }, [key, tipKey, publish]);

  const toggle = useCallback((url: string) => update((urls) => toggleSavedUrl(urls, url)), [update]);
  const add = useCallback((urls: readonly string[]) => update((saved) => mergeSavedUrls(saved, urls)), [update]);
  const reorder = useCallback((urls: readonly string[]) => update((saved) => reorderSavedUrls(saved, urls)), [update]);
  const replace = useCallback((urls: readonly string[]) => update(() => [...new Set(urls)]), [update]);
  const remove = useCallback((removed: readonly string[]) => {
    const removals = new Set(removed);
    update((urls) => urls.filter((url) => !removals.has(url)));
  }, [update]);

  return { ...state, toggle, add, reorder, replace, remove, showTip, dismissTip };
}
