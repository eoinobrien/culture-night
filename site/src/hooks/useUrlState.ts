"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CultureNightEvent } from "@/interfaces/culture-night-event";
import { createStateLink, readStateLink, defaultUrlState, UrlStateError, type UrlState } from "@/lib/url-state";

type Change = Partial<UrlState> | ((previous: UrlState) => UrlState);

export default function useUrlState(events: CultureNightEvent[], year: number) {
  const [state, setState] = useState(defaultUrlState);
  const current = useRef(state);
  const [ready, setReady] = useState(false);
  const loaded = useRef(false);
  const [notice, setNotice] = useState<string>();

  const write = useCallback((next: UrlState, mode: "push" | "replace") => {
    try {
      const target = new URL(createStateLink(window.location.href, next, year));
      target.search = window.location.search;
      if (window.location.href === target.href) return;
      window.history[mode === "push" ? "pushState" : "replaceState"](
        window.history.state, "", `${target.pathname}${target.search}${target.hash}`
      );
    } catch (error) {
      if (!(error instanceof DOMException) && !(error instanceof UrlStateError)) throw error;
      console.error("Could not update the Culture Night URL.", error);
      setNotice("Your view changed, but its URL could not be updated. Reloading may restore the previous view.");
    }
  }, [year]);

  useEffect(() => {
    const restore = () => {
      let next: UrlState;
      try {
        next = readStateLink(window.location.href, events, year);
        setNotice(undefined);
        write(next, "replace");
      } catch (error) {
        if (!(error instanceof UrlStateError)) throw error;
        console.error("Could not restore the Culture Night link.", error);
        setNotice(`${error.message} Your saved My Night has not been changed.`);
        next = defaultUrlState();
      }
      current.current = next;
      setState(next);
      loaded.current = true;
      setReady(true);
    };
    restore();
    window.addEventListener("popstate", restore);
    window.addEventListener("hashchange", restore);
    return () => {
      window.removeEventListener("popstate", restore);
      window.removeEventListener("hashchange", restore);
    };
  }, [events, year, write]);

  const update = useCallback((change: Change, mode: "push" | "replace" = "push") => {
    if (!loaded.current) {
      setNotice("The shared view is still loading. Please try again shortly.");
      return;
    }
    const previous = current.current;
    const next = typeof change === "function" ? change(previous) : { ...previous, ...change };
    if (next === previous) return;
    current.current = next;
    setState(next);
    setNotice(undefined);
    write(next, mode);
  }, [write]);

  return { state, ready, notice, update };
}
