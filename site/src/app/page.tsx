"use client";

import { CultureNightEvent } from "@/interfaces/culture-night-event";
import Events from "../api/events.json";
import { programmeDate } from "@/api/programme";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Geocode } from "@/interfaces/geocode";
import { Time } from "@/interfaces/time";
import SearchBox from "@/components/SearchBox";
import FiltersColumn from "@/components/FiltersColumn";
import EventResults from "@/components/EventResults";
import { AdjustmentsHorizontalIcon, ListBulletIcon, MapIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { availabilityError, filterEvents, searchEvents } from "@/lib/event-filters";

const IrelandLatLng: Geocode = { lat: 53.4230965, lng: -7.9254405 };
const events: CultureNightEvent[] = Events;
const Map = dynamic(() => import("@/components/EventMap"), {
  loading: () => <p role="status" className="map-loading">Loading the event map...</p>,
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
  const [view, setView] = useState<"list" | "map">("list");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterButton = useRef<HTMLButtonElement>(null);
  const resultsPanel = useRef<HTMLDivElement>(null);

  const filteredEvents = useMemo(
    () => filterEvents(events, { startTime, endTime, eventType, bookingDetails, ageGroup }),
    [startTime, endTime, eventType, bookingDetails, ageGroup]
  );
  const matchingEvents = useMemo(
    () => searchEvents(filteredEvents, searchTerm),
    [filteredEvents, searchTerm]
  );
  const selectedEvent = matchingEvents.find((event) => event.url === selectedUrl);
  const timeError = availabilityError(startTime, endTime);
  const activeFilters = [
    startTime.hour !== 15 || startTime.minute !== 0 || endTime.hour !== 3 || endTime.minute !== 0,
    eventType !== "All", bookingDetails !== "All", ageGroup !== "All",
  ].filter(Boolean).length;
  const unmappedEventCount = matchingEvents.filter((event) => !event.geocode).length;
  const resultKey = JSON.stringify([searchTerm, startTime, endTime, eventType, bookingDetails, ageGroup]);

  useEffect(() => {
    if (selectedUrl && !selectedEvent) setSelectedUrl(undefined);
  }, [selectedUrl, selectedEvent]);
  useEffect(() => { resultsPanel.current?.scrollTo({ top: 0 }); }, [resultKey]);

  const closeEvent = useCallback((url: string) => {
    setSelectedUrl((current) => current === url ? undefined : current);
  }, []);

  const changeSearch = (value: string) => {
    setSearchTerm(value);
    setSelectedUrl(undefined);
  };
  const runSearch = () => {
    setView("list");
    setSelectedUrl(undefined);
    resultsPanel.current?.scrollTo({ top: 0 });
  };
  const selectSuggestion = (event: CultureNightEvent) => {
    setSelectedUrl(event.url);
    setView(event.geocode ? "map" : "list");
    if (!event.geocode) resultsPanel.current?.scrollTo({ top: 0 });
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
  const closeFilters = () => {
    setFiltersOpen(false);
    filterButton.current?.focus();
  };

  return (
    <main className="culture-app">
      <header className="app-header">
        <h1>Culture Night</h1>
        <p>{programmeDate}</p>
      </header>
      <div className={`discovery-workspace ${view}-view`}>
        <section className="discovery-sidebar" aria-label="Find events">
          <div className="discovery-controls">
            <SearchBox
              searchTerm={searchTerm}
              setSearchTerm={changeSearch}
              suggestions={matchingEvents}
              selectSuggestion={selectSuggestion}
              runSearch={runSearch}
              clearSearch={clearSearch}
              hasSelection={Boolean(selectedEvent)}
            />
            <div className="discovery-toolbar">
              <button
                type="button"
                ref={filterButton}
                className="filter-toggle"
                aria-expanded={filtersOpen}
                aria-controls="event-filters"
                onClick={() => setFiltersOpen(!filtersOpen)}
              >
                <AdjustmentsHorizontalIcon aria-hidden="true" />
                Filters {activeFilters > 0 && <span className="filter-count">{activeFilters}</span>}
              </button>
              <div className="view-switch" role="group" aria-label="Results view">
                <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>
                  <ListBulletIcon aria-hidden="true" /> List
                </button>
                <button type="button" aria-pressed={view === "map"} onClick={() => setView("map")}>
                  <MapIcon aria-hidden="true" /> Map
                </button>
              </div>
              <span className="scope-label">All Ireland</span>
            </div>
            <div className="results-heading">
              <h2 role="status" aria-live="polite" aria-atomic="true">
                {matchingEvents.length.toLocaleString("en-IE")} {matchingEvents.length === 1 ? "event" : "events"}
              </h2>
              <span>{searchTerm.trim() ? "Matching your search" : "Across Ireland"}</span>
            </div>
            {filtersOpen && (
              <section
                id="event-filters"
                aria-label="Event filters"
                className="filter-panel"
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.stopPropagation();
                    closeFilters();
                  }
                }}
              >
                <div className="filter-panel-heading">
                  <h2>Filter events</h2>
                  <button type="button" className="icon-button" aria-label="Close filters" onClick={closeFilters}>
                    <XMarkIcon aria-hidden="true" />
                  </button>
                </div>
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
                {timeError && <p role="alert" className="filter-error">{timeError}</p>}
                <div className="filter-panel-actions">
                  <button type="button" className="text-button" onClick={resetFilters}>Reset filters</button>
                  <button type="button" className="primary-button" onClick={closeFilters}>
                    Show {matchingEvents.length.toLocaleString("en-IE")} events
                  </button>
                </div>
              </section>
            )}
          </div>
          <div className="results-panel" ref={resultsPanel}>
            <EventResults
              key={resultKey}
              events={matchingEvents}
              selectedEvent={selectedEvent}
              onSelect={selectSuggestion}
              onClose={closeEvent}
              onClear={clearSearch}
              onReset={resetFilters}
              timeError={timeError}
            />
            <p className="programme-note">
              {events.length.toLocaleString("en-IE")} events in the programme.
              Check official listings for updates and admission details.
            </p>
          </div>
        </section>
        <section className="map-panel" aria-label="Event map">
          <div className="map-caption">
            <span>All Ireland</span>
            <span>Select a pin to see an event</span>
          </div>
          {matchingEvents.length === 0 && (
            <div className="map-empty" role="status">
              <strong>{timeError || "No events match your search and filters."}</strong>
              <button type="button" className="text-button" onClick={clearSearch}>Clear search</button>
              <button type="button" className="text-button" onClick={resetFilters}>Reset filters</button>
            </div>
          )}
          {unmappedEventCount > 0 && (
            <button type="button" className="unmapped-notice" onClick={() => setView("list")}>
              {unmappedEventCount} events have no map location. View them in the list.
            </button>
          )}
          <Map
            position={IrelandLatLng}
            zoom={7}
            events={matchingEvents}
            selectedUrl={selectedEvent?.url}
            onSelect={setSelectedUrl}
            onClose={closeEvent}
          />
        </section>
      </div>
    </main>
  );
}
