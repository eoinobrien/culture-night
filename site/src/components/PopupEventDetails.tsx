"use client";

import { CultureNightEvent } from "@/interfaces/culture-night-event";
import {
  ClockIcon, MapPinIcon, UserIcon, TicketIcon,
  UserGroupIcon, InformationCircleIcon,
} from "@heroicons/react/24/solid";
import PopupDetail from "./PopupDetail";

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
}: {
  event: CultureNightEvent;
  onDismiss?: () => void;
}) {
  const bookingLink = webLink(event.bookingLink);
  const onlineLink = webLink(event.onlineContentLink);
  const officialLink = webLink(event.url);
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
      <header className="event-details-header" tabIndex={0} aria-label="Event title">
        <h2 className="text-xl font-bold [overflow-wrap:anywhere]">{event.title}</h2>
      </header>
      <div className="event-details-body" tabIndex={0} aria-label="Event details">
        <dl className="grid gap-3">
          {event.time && <PopupDetail label="Time" icon={<ClockIcon />} text={event.time} />}
          {event.venueName && <PopupDetail label="Venue" icon={<MapPinIcon />} text={event.venueName} />}
          {event.host && <PopupDetail label="Host" icon={<UserIcon />} text={event.host} />}
          {event.fullAddress && <PopupDetail label="Address" icon={<MapPinIcon />} text={event.fullAddress} />}
          {event.bookingDetails && <PopupDetail label="Booking" icon={<TicketIcon />} text={event.bookingDetails} />}
          {event.ageGroup && <PopupDetail label="Age suitability" icon={<UserGroupIcon />} text={event.ageGroup} />}
          {event.features.length > 0 && (
            <PopupDetail label="Accessibility and facilities" icon={<InformationCircleIcon />} text={event.features.join("\n")} />
          )}
        </dl>
        {!bookingLink && (event.bookingLink || event.bookingDetails.toLowerCase() === "booking required") && (
          <p className="mt-3">No booking link available. Check the official listing for how to book.</p>
        )}
        {event.onlineContentLink && !onlineLink && (
          <p className="mt-3">Online content link unavailable. Check the official listing.</p>
        )}
        {!officialLink && <p className="mt-3">Official listing link unavailable.</p>}
        <nav aria-label="Event links" className="my-3 flex flex-wrap gap-x-4 gap-y-2 border-y border-gray-600 py-3">
          {bookingLink && <a href={bookingLink} target="_blank" rel="noreferrer" className="underline">View booking</a>}
          {onlineLink && <a href={onlineLink} target="_blank" rel="noreferrer" className="underline">Online content</a>}
          {officialLink && <a href={officialLink} target="_blank" rel="noreferrer" className="underline">Official event listing</a>}
        </nav>
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
