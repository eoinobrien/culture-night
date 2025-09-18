"use client";

import { CultureNightEvent } from "@/interfaces/culture-night-event";

import Events from "../api/events.json";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Geocode } from "@/interfaces/geocode";
import { Time } from "@/interfaces/time";
import SearchBox from "@/components/SearchBox";
import FiltersColumn from "@/components/FiltersColumn";
import MapFilter from "@/components/MapFilter";

const IrelandLatLng: Geocode = { lat: 53.4230965, lng: -7.9254405 };

const parseTimeToString = (time: Time): string => {
  return `${time.hour.toLocaleString("en-IE", {
    minimumIntegerDigits: 2,
    useGrouping: false,
  })}:${time.minute.toLocaleString("en-IE", {
    minimumIntegerDigits: 2,
    useGrouping: false,
  })}`;
};

const stringToTime = (str: string): Time => {
  return {
    hour: Number(str.split(":")[0]),
    minute: Number(str.split(":")[1]),
  };
};

const adjustHoursPastMidnight = (hour: number): number => {
  return hour < 15 ? hour + 24 : hour;
};

const compareTime = (a: Time, b: Time): number => {
  const aHour = adjustHoursPastMidnight(a.hour);
  const bHour = adjustHoursPastMidnight(b.hour);

  if (aHour < bHour || (aHour === bHour && a.minute < b.minute)) {
    return -1;
  }

  if (aHour === bHour && a.minute === b.minute) {
    return 0;
  }

  return 1;
};

const filterEventByTime = (
  filterStartTime: Time,
  filterEndTime: Time,
  event: CultureNightEvent
): boolean => {
  // filter: 15:00 - 16:00, event: 16:00 – 16:45 = hide
  if (compareTime(filterEndTime, event.startTime) <= 0) {
    return false;
  }

  // all events that occur inside filter
  // filter: 15:00 - 16:00, event: 15:15 - 15:45 = show
  if (
    compareTime(filterStartTime, event.startTime) <= 0 &&
    compareTime(filterEndTime, event.endTime) > 0
  ) {
    return true;
  }

  // all events that occur inside filter
  // filter: 15:15 - 15:15, event: 15:00 - 16:00 = show
  if (
    compareTime(filterStartTime, event.startTime) >= 0 &&
    compareTime(filterStartTime, event.endTime) < 0
  ) {
    return true;
  }

  return false;
};

const filterEventByStringFilter = (
  filter: string,
  eventValue: string
): boolean => {
  if (filter === "All") {
    return true;
  }

  return filter === eventValue;
};

export default function Home() {
  const events = Events as CultureNightEvent[];

  // const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  // const [selectedGenre, setSelectedGenre] = useState<string[]>([]);
  const [startTime, setStartTime] = useState<Time>({ hour: 15, minute: 0 });
  const [endTime, setEndTime] = useState<Time>({ hour: 3, minute: 0 });
  const [eventType, setEventType] = useState<string>("All");
  const [bookingDetails, setBookingDetails] = useState<string>("All");
  const [ageGroup, setAgeGroup] = useState<string>("All");

  // search state
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedTitle, setSelectedTitle] = useState<string | undefined>(
    undefined
  );

  // autocomplete UI state
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  // flexible search matcher: matches title, locations, genres, venueName, address, description, host, eventType, ageGroup
  const matchEvent = (ev: CultureNightEvent, term: string) => {
    const t = term.toLowerCase();
    if (!t) return false;
    if ((ev.title || "").toLowerCase().includes(t)) return true;
    if (ev.venueName && ev.venueName.toLowerCase().includes(t)) return true;
    if (ev.fullAddress && ev.fullAddress.toLowerCase().includes(t)) return true;
    if (ev.host && ev.host.toLowerCase().includes(t)) return true;
    if (
      ev.locations &&
      ev.locations.some((l) => l.title.toLowerCase().includes(t))
    )
      return true;
    if (ev.genres && ev.genres.some((g) => g.title.toLowerCase().includes(t)))
      return true;
    return false;
  };

  // live suggestions computed from searchTerm
  const suggestions = useMemo(() => {
    const term = searchTerm.trim();
    if (!term) return events.map((e) => e.title);
    return (
      events
        .filter((e) => matchEvent(e, term))
        .map((e) => e.title)
        // remove duplicates
        .filter((v, i, a) => a.indexOf(v) === i)
    );
  }, [events, searchTerm]);

  // count of suggestion results (defined after suggestions is computed)
  const matchesCount = suggestions.length;

  // UI: filters collapsed on mobile
  const [filtersOpen, setFiltersOpen] = useState<boolean>(true);

  const selectedEvent = selectedTitle
    ? events.find((e) => e.title === selectedTitle)
    : undefined;

  const runSearch = () => {
    const term = searchTerm.trim();
    if (!term) return;
    const found = events.find((e) => matchEvent(e, term));
    if (found) setSelectedTitle(found.title);
  };

  const selectSuggestion = (title: string) => {
    setSearchTerm(title);
    setShowSuggestions(false);
    setActiveIndex(-1);
    // select immediately
    setSelectedTitle(title);
  };

  const Map = useMemo(
    () =>
      dynamic(() => import("@/components/EventMap"), {
        loading: () => <p>Map is loading</p>,
        ssr: false,
      }),
    []
  );

  return (
    <div className="max-h-svh">
      <div className="mx-auto lg:flex lg:flex-shrink-1 lg:max-w-none">
        <div className="p-4 sm:p-6 lg:w-[30%]">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">Culture Night</h1>
            <h2 className="text-sm">September 19th, 2025</h2>
          </div>

          <SearchBox
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            showSuggestions={showSuggestions}
            setShowSuggestions={setShowSuggestions}
            activeIndex={activeIndex}
            setActiveIndex={setActiveIndex}
            suggestions={suggestions}
            selectSuggestion={selectSuggestion}
            runSearch={runSearch}
            matchesCount={matchesCount}
            setSelectedTitle={(t) => setSelectedTitle(t)}
            selectedEvent={selectedEvent}
          />
          <FiltersColumn
            startTime={startTime}
            endTime={endTime}
            setStartTime={setStartTime}
            setEndTime={setEndTime}
            eventType={eventType}
            setEventType={setEventType}
            bookingDetails={bookingDetails}
            setBookingDetails={setBookingDetails}
            ageGroup={ageGroup}
            setAgeGroup={setAgeGroup}
            events={events}
          />
        </div>
        <div className="h-2 w-screen lg:w-2 lg:h-screen bg-gradient-to-r lg:bg-gradient-to-b from-[#00893e] via-[#ffa300] to-[#ff0000]"></div>
        <div className="lg:mt-0 lg:w-[70%] lg:flex-shrink-1">
          <div className="text-center lg:flex lg:flex-col lg:justify-center">
            <Map
              position={IrelandLatLng}
              zoom={7}
              events={events.filter(
                (e) =>
                  filterEventByTime(startTime, endTime, e) &&
                  filterEventByStringFilter(eventType, e.eventType) &&
                  filterEventByStringFilter(bookingDetails, e.bookingDetails) &&
                  filterEventByStringFilter(ageGroup, e.ageGroup)
              )}
              selectedTitle={selectedTitle}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
