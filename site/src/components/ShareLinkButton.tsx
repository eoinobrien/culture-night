"use client";

import { useEffect, useId, useState } from "react";
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
  const [fallback, setFallback] = useState<string>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    setCopied(false);
    setFallback(undefined);
    setError(undefined);
  }, [identity]);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 3000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    setCopied(false);
    setError(undefined);
    setFallback(undefined);
    let link: string;
    try {
      link = getLink();
    } catch (error) {
      if (!(error instanceof UrlStateError) && !(error instanceof TypeError)) throw error;
      console.error("Could not create the Culture Night share link.", error);
      setError("This link could not be created. Shorten the search or share fewer events.");
      return;
    }
    if (!navigator.clipboard?.writeText) {
      setError("Automatic copying is unavailable. Select and copy the link below.");
      setFallback(link);
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch (error) {
      if (!(error instanceof DOMException)) throw error;
      console.error("Could not copy the Culture Night share link.", error);
      setError("The link could not be copied automatically. Select and copy it below.");
      setFallback(link);
    }
  };

  return (
    <div className={`share-control ${compact ? "compact-share" : ""}`}>
      <button type="button" className={compact ? "icon-button share-button" : "text-button share-button"}
        aria-label={label} title={label} disabled={disabled} onClick={copy}>
        <ShareIcon aria-hidden="true" />{!compact && label}
      </button>
      {copied && <p className="copy-status" role="status">Link copied</p>}
      {error && (
        <div className="share-fallback">
          <button type="button" className="icon-button" aria-label="Close sharing message"
            onClick={() => { setError(undefined); setFallback(undefined); }}><XMarkIcon aria-hidden="true" /></button>
          <p role="alert">{error}</p>
          {fallback && (
            <>
              <label htmlFor={inputId}>Share link</label>
              <input id={inputId} readOnly value={fallback} onFocus={(event) => event.currentTarget.select()} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
