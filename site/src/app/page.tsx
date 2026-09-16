"use client";

import { CultureNightEvent } from "@/interfaces/culture-night-event";
import Events from "../api/events.json";
import { programmeDate } from "@/api/programme";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Geocode } from "@/interfaces/geocode";
import { Time } from "@/interfaces/time";
import SearchBox from "@/components/SearchBox";
import FiltersColumn from "@/components/FiltersColumn";
import { availabilityError, filterEvents, searchEvents } from "@/lib/event-filters";

const IrelandLatLng: Geocode = { lat: 53.4230965, lng: -7.9254405 };
const events: CultureNightEvent[] = Events;
const unmappedEventCount = events.filter((event) => event.geocode === null).length;
const Map = dynamic(() => import("@/components/EventMap"), {
  loading: () => <p>Map is loading</p>,
  ssr: false,
});

export default function Home() {
  const [startTime, setStartTime] = useState<Time>({ hour: 15, minute: 0 });
  const [endTime, setEndTime] = useState<Time>({ hour: 3, minute: 0 });
  const [eventType, setEventType] = useState("All");
  const [bookingDetails, setBookingDetails] = useState("All");
  const [ageGroup, setAgeGroup] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUrl, setSelectedUrl] = useState<string>();

  const filteredEvents = useMemo(
    () => filterEvents(events, { startTime, endTime, eventType, bookingDetails, ageGroup }),
    [startTime, endTime, eventType, bookingDetails, ageGroup]
  );
  const suggestions = useMemo(
    () => searchEvents(filteredEvents, searchTerm),
    [filteredEvents, searchTerm]
  );
  const selectedEvent = filteredEvents.find((event) => event.url === selectedUrl);
  const timeError = availabilityError(startTime, endTime);
  const searchMessage = timeError
    ? undefined
    : filteredEvents.length === 0
      ? "No events match these filters."
      : searchTerm.trim() && suggestions.length === 0
        ? "No matching events. Try another search or change the filters."
        : undefined;

  useEffect(() => {
    if (selectedUrl && !selectedEvent) setSelectedUrl(undefined);
  }, [selectedUrl, selectedEvent]);

  const closeEvent = useCallback((url: string) => {
    setSelectedUrl((current) => current === url ? undefined : current);
  }, []);

  const changeSearch = (value: string) => {
    setSearchTerm(value);
    setSelectedUrl(undefined);
  };
  const runSearch = () => {
    if (searchTerm.trim()) setSelectedUrl(suggestions[0]?.url);
  };
  const selectSuggestion = (event: CultureNightEvent) => {
    setSearchTerm(event.title);
    setSelectedUrl(event.url);
  };
  const clearSearch = () => {
    setSearchTerm("");
    setSelectedUrl(undefined);
  };
  const resetFilters = () => {
    setStartTime({ hour: 15, minute: 0 });
    setEndTime({ hour: 3, minute: 0 });
    setEventType("All");
    setBookingDetails("All");
    setAgeGroup("All");
  };

  return (
    <main className="max-h-svh">
      <div className="mx-auto lg:flex lg:flex-shrink-1 lg:max-w-none">
        <div className="p-4 sm:p-6 lg:w-[30%]">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">Culture Night</h1>
            <h2 className="text-sm">{programmeDate}</h2>
            {unmappedEventCount > 0 && (
              <p className="mt-2 text-sm">
                {unmappedEventCount} events have no map location. You can still find
                their details using search.
              </p>
            )}
          </div>

          <SearchBox
            searchTerm={searchTerm}
            setSearchTerm={changeSearch}
            suggestions={suggestions}
            selectSuggestion={selectSuggestion}
            runSearch={runSearch}
            clearSearch={clearSearch}
            selectedEvent={selectedEvent}
            message={searchMessage}
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
          {timeError && <p role="alert" className="mb-3 text-red-300">{timeError}</p>}
          {(timeError || filteredEvents.length === 0) && (
            <button type="button" onClick={resetFilters} className="rounded bg-gray-700 px-3 py-2">
              Reset filters
            </button>
          )}
        </div>
        <div className="h-2 w-screen lg:w-2 lg:h-screen bg-gradient-to-r lg:bg-gradient-to-b from-[#00893e] via-[#ffa300] to-[#ff0000]"></div>
        <div className="lg:mt-0 lg:w-[70%] lg:flex-shrink-1">
          <div className="text-center lg:flex lg:flex-col lg:justify-center">
            <Map
              position={IrelandLatLng}
              zoom={7}
              events={filteredEvents}
              selectedUrl={selectedEvent?.url}
              onSelect={setSelectedUrl}
              onClose={closeEvent}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
