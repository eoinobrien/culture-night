"use client";

import { CultureNightEvent } from "@/interfaces/culture-night-event";
import {
  ClockIcon,
  DocumentTextIcon,
  MapPinIcon,
  UserIcon,
} from "@heroicons/react/24/solid";
import PopupDetail from "./PopupDetail";

type PopupEventDetailsProps = {
  event: CultureNightEvent;
};

export default function PopupEventDetails({ event }: PopupEventDetailsProps) {
  return (
    <div>
      <h1 className="text-xl font-bold mb-2">{event.title}</h1>
      <div className="grid truncate gap-1">
        {event.venueName && (
          <PopupDetail icon={<MapPinIcon />} text={event.venueName} />
        )}
        {event.host && <PopupDetail icon={<UserIcon />} text={event.host} />}
        {event.time && <PopupDetail icon={<ClockIcon />} text={event.time} />}
        {event.description && (
          <PopupDetail icon={<DocumentTextIcon />} text={event.description} />
        )}
        <div className="mt-2 pt-2 border-t-2">
        <a
          href={event.url}
          target="_blank"
          className="hover:underline focus:underline"
        >
          Culture Night Event Page
        </a></div>
      </div>
    </div>
  );
}
