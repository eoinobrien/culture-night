"use client";

import { CultureNightEvent } from "@/interfaces/culture-night-event";
import {
  ClockIcon, MapPinIcon, UserIcon, TicketIcon,
  UserGroupIcon, InformationCircleIcon,
} from "@heroicons/react/24/solid";
import PopupDetail from "./PopupDetail";
import { useEffect, useRef } from "react";
import SaveEventButton, { type ShortlistControls } from "./SaveEventButton";
import ShareLinkButton from "./ShareLinkButton";

function webLink(value: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch (error) {
    if (error instanceof TypeError) return undefined;
    throw error;
  }
}

export default function PopupEventDetails({
  event,
  onDismiss,
  shortlist,
  getEventLink,
  offline = false,
  focusOnOpen: focusRequested,
}: {
  event: CultureNightEvent;
  onDismiss?: () => void;
  shortlist?: ShortlistControls;
  getEventLink?: (event: CultureNightEvent) => string;
  offline?: boolean;
  focusOnOpen?: boolean;
}) {
  const heading = useRef<HTMLElement>(null);
  const focusOnOpen = focusRequested ?? Boolean(onDismiss);
  useEffect(() => {
    if (!focusOnOpen) return;
    const previous = document.activeElement;
    heading.current?.focus({ preventScroll: true });
    return () => {
      if (document.activeElement === document.body && previous instanceof HTMLElement &&
          previous.isConnected && previous.getClientRects().length > 0) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [event.url, focusOnOpen]);
  const bookingLink = webLink(event.bookingLink);
  const onlineLink = webLink(event.onlineContentLink);
  const officialLink = webLink(event.url);
  const locationQuery = event.geocode
    ? `${event.geocode.lat},${event.geocode.lng}`
    : [event.venueName, event.fullAddress].filter(Boolean).join(", ");
  const mapsLink = locationQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationQuery)}` : undefined;
  return (
    <article
      className="event-details min-w-0 text-left text-sm"
      onKeyDownCapture={(event) => {
        if (event.key === "Escape") {
          if (onDismiss) {
            event.preventDefault();
            event.stopPropagation();
            onDismiss();
          }
        } else {
          event.stopPropagation();
        }
      }}
    >
      <header ref={heading} className="event-details-header" tabIndex={0} aria-label="Event title">
        <h2 className="text-xl font-bold [overflow-wrap:anywhere]">{event.title}</h2>
      </header>
      <div className="event-details-body" tabIndex={0} aria-label="Event details">
        {(shortlist || getEventLink) && (
          <div className="event-details-actions">
            {shortlist && <SaveEventButton event={event} shortlist={shortlist} />}
            {getEventLink && <ShareLinkButton compact label="Share event" identity={event.url} getLink={() => getEventLink(event)} />}
          </div>
        )}
        <dl className="event-essentials">
          {event.time && <PopupDetail label="Time" icon={<ClockIcon />} text={event.time} />}
          {(event.venueName || event.fullAddress) && (
            <PopupDetail label="Venue" icon={<MapPinIcon />} text={event.venueName || event.fullAddress}>
              {mapsLink && <a href={mapsLink} target="_blank" rel="noreferrer" className="venue-map-link"
                aria-label={`Open ${event.venueName || event.title} in Google Maps`}>Google Maps</a>}
            </PopupDetail>
          )}
          {event.bookingDetails && <PopupDetail label="Booking" hideLabel icon={<TicketIcon />} text={event.bookingDetails} />}
        </dl>
        {!bookingLink && (event.bookingLink || event.bookingDetails.toLowerCase() === "booking required") && (
          <p className="mt-3">No booking link available. Check the official listing for how to book.</p>
        )}
        {event.onlineContentLink && !onlineLink && (
          <p className="mt-3">Online content link unavailable. Check the official listing.</p>
        )}
        {!officialLink && <p className="mt-3">Official listing link unavailable.</p>}
        {offline && <p className="online-links-notice">These details are saved. Booking, official listings and Google Maps need internet.</p>}
        <nav aria-label="Event links" className="event-links">
          {bookingLink && <a href={bookingLink} target="_blank" rel="noreferrer" className="underline">View booking</a>}
          {onlineLink && <a href={onlineLink} target="_blank" rel="noreferrer" className="underline">Online content</a>}
          {officialLink && <a href={officialLink} target="_blank" rel="noreferrer" className="underline">Official event listing</a>}
        </nav>
        {(event.host || event.fullAddress || event.ageGroup || event.features.length > 0) && (
          <details>
            <summary>Address, age and accessibility</summary>
            <dl className="grid gap-2 py-2">
              {event.host && <PopupDetail label="Host" icon={<UserIcon />} text={event.host} />}
              {event.fullAddress && <PopupDetail label="Address" icon={<MapPinIcon />} text={event.fullAddress} />}
              {event.ageGroup && <PopupDetail label="Age suitability" icon={<UserGroupIcon />} text={event.ageGroup} />}
              {event.features.length > 0 && (
                <PopupDetail label="Accessibility and facilities" icon={<InformationCircleIcon />} text={event.features.join("\n")} />
              )}
            </dl>
          </details>
        )}
        {event.description && (
          <details>
            <summary className="cursor-pointer py-2 font-semibold">Full description</summary>
            <p className="whitespace-pre-line [overflow-wrap:anywhere]">{event.description}</p>
          </details>
        )}
      </div>
    </article>
  );
}
