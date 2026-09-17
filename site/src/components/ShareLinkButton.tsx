"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ShareIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { UrlStateError } from "@/lib/url-state";

export default function ShareLinkButton({
  getLink, label, compact = false, disabled = false, identity,
}: {
  getLink: () => string;
  label: string;
  compact?: boolean;
  disabled?: boolean;
  identity?: string;
}) {
  const inputId = useId();
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState<{ link: string; offerCopy: boolean }>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const generation = useRef(0);
  useLayoutEffect(() => {
    mounted.current = true;
    generation.current++;
    setCopied(false);
    setFallback(undefined);
    setError(undefined);
    return () => {
      mounted.current = false;
    };
  }, [identity]);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 3000);
    return () => clearTimeout(timer);
  }, [copied]);

  const clearFeedback = () => {
    setCopied(false);
    setError(undefined);
    setFallback(undefined);
  };
  const beginRequest = () => {
    inFlight.current = true;
    setPending(true);
    return generation.current;
  };
  const finishRequest = () => {
    inFlight.current = false;
    if (mounted.current) setPending(false);
  };
  const isCurrent = (request: number) => mounted.current && generation.current === request;
  const offerCopy = (link: string) => {
    setError("Sharing could not be opened. Copy the link or select it below.");
    setFallback({ link, offerCopy: true });
  };
  const copy = async (link: string) => {
    if (inFlight.current || disabled) return;
    clearFeedback();
    if (typeof navigator.clipboard?.writeText !== "function") {
      setError("Automatic copying is unavailable. Select and copy the link below.");
      setFallback({ link, offerCopy: false });
      return;
    }
    const request = beginRequest();
    try {
      await navigator.clipboard.writeText(link);
      if (isCurrent(request)) setCopied(true);
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        console.warn("Browser clipboard access was denied.", error);
      } else {
        console.error("Could not copy the Culture Night share link.", error);
      }
      if (isCurrent(request)) {
        setError("The link could not be copied automatically. Select and copy it below.");
        setFallback({ link, offerCopy: false });
      }
    } finally {
      finishRequest();
    }
  };
  const share = async () => {
    if (inFlight.current || disabled) return;
    clearFeedback();
    let link: string;
    try {
      link = getLink();
    } catch (error) {
      console.error("Could not create the Culture Night share link.", error);
      setError(error instanceof UrlStateError || error instanceof TypeError
        ? "This link could not be created. Shorten the search or share fewer events."
        : "This link could not be created. Please try again.");
      return;
    }
    const data: ShareData = { title: "Culture Night", url: link };
    let shareable: boolean;
    try {
      shareable = typeof navigator.share === "function" &&
        (typeof navigator.canShare !== "function" || navigator.canShare(data));
    } catch (error) {
      console.error("Could not check native sharing support.", error);
      offerCopy(link);
      return;
    }
    if (!shareable) {
      void copy(link);
      return;
    }
    const request = beginRequest();
    try {
      // Invoke before the first await so the original click activation reaches the native sheet.
      await navigator.share(data);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (error instanceof DOMException &&
        ["NotAllowedError", "InvalidStateError", "DataError"].includes(error.name)) {
        console.warn("Native Culture Night sharing was unavailable.", error);
      } else {
        console.error("Could not share the Culture Night link.", error);
      }
      if (isCurrent(request)) offerCopy(link);
    } finally {
      finishRequest();
    }
  };

  return (
    <div className={`share-control ${compact ? "compact-share" : ""}`}>
      <button type="button" className={compact ? "icon-button share-button" : "text-button share-button"}
        aria-label={label} title={label} disabled={disabled || pending} aria-busy={pending} onClick={share}>
        <ShareIcon aria-hidden="true" />{!compact && label}
      </button>
      {copied && <p className="copy-status" role="status">Link copied</p>}
      {error && (
        <div className="share-fallback">
          <button type="button" className="icon-button" aria-label="Close sharing message"
            onClick={(event) => { event.stopPropagation(); setError(undefined); setFallback(undefined); }}><XMarkIcon aria-hidden="true" /></button>
          <p role="alert">{error}</p>
          {fallback && (
            <>
              {fallback.offerCopy && (
                <button type="button" className="text-button" disabled={disabled || pending}
                  onClick={(event) => { event.stopPropagation(); void copy(fallback.link); }}>Copy link</button>
              )}
              <label htmlFor={inputId}>Share link</label>
              <input id={inputId} readOnly value={fallback.link} onFocus={(event) => event.currentTarget.select()} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
