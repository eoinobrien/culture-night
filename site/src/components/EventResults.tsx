import { useState } from "react";
import Image from "next/image";
import { ArrowUpRightIcon, ClockIcon, PhotoIcon, XMarkIcon } from "@heroicons/react/24/outline";
import type { CultureNightEvent } from "@/interfaces/culture-night-event";
import PopupEventDetails from "./PopupEventDetails";

function EventImage({ event, priority }: { event: CultureNightEvent; priority: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="event-image">
      {event.image && !failed ? (
        <Image
          src={event.image}
          alt=""
          fill
          unoptimized
          priority={priority}
          sizes="(min-width: 800px) 360px, 100vw"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="image-placeholder">
          <PhotoIcon aria-hidden="true" />
          <span>{failed ? "Image unavailable" : "No event image"}</span>
        </span>
      )}
    </span>
  );
}

export default function EventResults({
  events, selectedEvent, onSelect, onClose, onClear, onReset, timeError,
}: {
  events: CultureNightEvent[];
  selectedEvent?: CultureNightEvent;
  onSelect: (event: CultureNightEvent) => void;
  onClose: (url: string) => void;
  onClear: () => void;
  onReset: () => void;
  timeError?: string;
}) {
  const [limit, setLimit] = useState(30);
  if (!events.length) {
    return (
      <section className="empty-results" aria-label="No matching events">
        <h3>{timeError ? "Check your availability" : "No matching events"}</h3>
        <p>{timeError || "Try another place, event or venue, or change your filters."}</p>
        <div>
          <button type="button" className="text-button" onClick={onClear}>Clear search</button>
          <button type="button" className="text-button" onClick={onReset}>Reset filters</button>
        </div>
      </section>
    );
  }
  return (
    <>
      {selectedEvent?.geocode && (
        <section className="selected-result" aria-label="Selected event">
          <p>Selected event</p>
          <h3>{selectedEvent.title}</h3>
          <a href={selectedEvent.url} target="_blank" rel="noreferrer">Official event listing</a>
        </section>
      )}
      {selectedEvent && !selectedEvent.geocode && (
        <section className="unmapped-details" aria-label="Selected event">
          <div className="unmapped-heading">
            <p>No map location available</p>
            <button
              type="button"
              className="icon-button"
              aria-label="Close event details"
              onClick={() => onClose(selectedEvent.url)}
            >
              <XMarkIcon aria-hidden="true" />
            </button>
          </div>
          <PopupEventDetails event={selectedEvent} onDismiss={() => onClose(selectedEvent.url)} />
        </section>
      )}
      <ul className="event-results" aria-label="Matching event results">
        {events.slice(0, limit).map((event, index) => (
          <li key={event.url}>
            <button
              type="button"
              className={`event-card ${index === 0 ? "featured-event" : ""}`}
              aria-pressed={selectedEvent?.url === event.url}
              onClick={() => onSelect(event)}
            >
              <EventImage event={event} priority={index === 0} />
              <span className="event-card-body">
                <span className="event-genre">{event.genres.map((genre) => genre.title).join(" / ") || event.eventType}</span>
                <span className="event-title">{event.title}</span>
                <span className="event-venue">{event.venueName || event.host || event.fullAddress}</span>
                <span className="event-meta">
                  <span className="event-time"><ClockIcon aria-hidden="true" />{event.time}</span>
                  <span className="booking-badge">{event.bookingDetails}</span>
                </span>
                <span className="event-card-action">View event <ArrowUpRightIcon aria-hidden="true" /></span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {limit < events.length && (
        <button type="button" className="load-more" onClick={() => setLimit(limit + 30)}>
          Show more events <span>{Math.min(limit, events.length)} of {events.length.toLocaleString("en-IE")}</span>
        </button>
      )}
    </>
  );
}
