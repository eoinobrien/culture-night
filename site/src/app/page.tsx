"use client";

import { CultureNightEvent } from "@/interfaces/culture-night-event";
import Events from "../api/events.json";
import { programmeDate, programmeYear } from "@/api/programme";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Geocode } from "@/interfaces/geocode";
import { Time } from "@/interfaces/time";
import SearchBox from "@/components/SearchBox";
import FiltersColumn from "@/components/FiltersColumn";
import EventResults from "@/components/EventResults";
import { AdjustmentsHorizontalIcon, BookmarkIcon, ListBulletIcon, MapIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { availabilityError, filterEvents, searchEvents } from "@/lib/event-filters";
import { savedEventsInTimeOrder } from "@/lib/my-night";
import useMyNight from "@/hooks/useMyNight";
import MapEmptyState from "@/components/MapEmptyState";

const IrelandLatLng: Geocode = { lat: 53.4230965, lng: -7.9254405 };
const events: CultureNightEvent[] = Events;
const knownEventUrls = new Set(events.map((event) => event.url));
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
  const [myNightOpen, setMyNightOpen] = useState(false);
  const myNight = useMyNight(programmeYear);
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
  const savedEvents = useMemo(() => savedEventsInTimeOrder(events, myNight.urls), [myNight.urls]);
  const shortlist = useMemo(() => ({
    urls: new Set(myNight.urls), ready: myNight.ready, toggle: myNight.toggle,
  }), [myNight.urls, myNight.ready, myNight.toggle]);
  const unavailableSavedUrls = myNight.urls.filter((url) => !knownEventUrls.has(url));
  const visibleEvents = myNightOpen ? savedEvents : matchingEvents;
  const selectedEvent = visibleEvents.find((event) => event.url === selectedUrl);
  const timeError = myNightOpen ? undefined : availabilityError(startTime, endTime);
  const activeFilters = [
    startTime.hour !== 15 || startTime.minute !== 0 || endTime.hour !== 3 || endTime.minute !== 0,
    eventType !== "All", bookingDetails !== "All", ageGroup !== "All",
  ].filter(Boolean).length;
  const unmappedEventCount = visibleEvents.filter((event) => !event.geocode).length;
  const hasMapLocations = visibleEvents.length > unmappedEventCount;
  const resultKey = JSON.stringify([myNightOpen, searchTerm, startTime, endTime, eventType, bookingDetails, ageGroup]);

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
  const switchCollection = (saved: boolean) => {
    setMyNightOpen(saved);
    setView("list");
    setFiltersOpen(false);
    setSelectedUrl(undefined);
  };

  return (
    <main className="culture-app">
      <header className="app-header">
        <div className="app-brand">
          <h1>Culture Night</h1>
          <p>{programmeDate}</p>
        </div>
        <button
          type="button"
          className="my-night-toggle"
          aria-label={myNight.ready ? `My Night, ${savedEvents.length} saved ${savedEvents.length === 1 ? "event" : "events"}` : "My Night, loading saved events"}
          aria-pressed={myNightOpen}
          disabled={!myNight.ready}
          onClick={() => switchCollection(!myNightOpen)}
        >
          <BookmarkIcon aria-hidden="true" />
          My Night <span className="saved-count" aria-hidden="true">{myNight.ready ? savedEvents.length : "..."}</span>
        </button>
      </header>
      {myNight.notice && <p role="alert" className="storage-notice">{myNight.notice}</p>}
      <div className={`discovery-workspace ${view}-view`}>
        <section className="discovery-sidebar" aria-label="Find events">
          <div className="discovery-controls">
            {myNightOpen ? (
              <div className="my-night-intro">
                <h2>My Night</h2>
                <p>{myNight.persistent ? "Saved in this browser." : "Kept for this visit only."} Ordered by start time.</p>
              </div>
            ) : <SearchBox
              searchTerm={searchTerm}
              setSearchTerm={changeSearch}
              suggestions={matchingEvents}
              selectSuggestion={selectSuggestion}
              runSearch={runSearch}
              clearSearch={clearSearch}
              hasSelection={Boolean(selectedEvent)}
            />}
            <div className="discovery-toolbar">
              {myNightOpen ? (
                <button type="button" className="text-button" onClick={() => switchCollection(false)}>Browse events</button>
              ) : <button
                type="button"
                ref={filterButton}
                className="filter-toggle"
                aria-expanded={filtersOpen}
                aria-controls="event-filters"
                onClick={() => setFiltersOpen(!filtersOpen)}
              >
                <AdjustmentsHorizontalIcon aria-hidden="true" />
                Filters {activeFilters > 0 && <span className="filter-count">{activeFilters}</span>}
              </button>}
              <div className="view-switch" role="group" aria-label="Results view">
                <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>
                  <ListBulletIcon aria-hidden="true" /> List
                </button>
                <button type="button" aria-pressed={view === "map"} onClick={() => setView("map")}>
                  <MapIcon aria-hidden="true" /> Map
                </button>
              </div>
              <span className="scope-label">{myNightOpen ? "Your shortlist" : "All Ireland"}</span>
            </div>
            <div className="results-heading">
              <h2 role="status" aria-live="polite" aria-atomic="true">
                {visibleEvents.length.toLocaleString("en-IE")} {myNightOpen ? "saved " : ""}{visibleEvents.length === 1 ? "event" : "events"}
              </h2>
              <span>{myNightOpen ? "By start time" : searchTerm.trim() ? "Matching your search" : "Across Ireland"}</span>
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
            {myNightOpen && unavailableSavedUrls.length > 0 && (
              <div className="unavailable-saved" role="status">
                <p>{unavailableSavedUrls.length} saved {unavailableSavedUrls.length === 1 ? "event is" : "events are"} no longer in this programme.</p>
                <button type="button" className="text-button" onClick={() => myNight.remove(unavailableSavedUrls)}>
                  Remove unavailable events
                </button>
              </div>
            )}
            <EventResults
              key={resultKey}
              events={visibleEvents}
              selectedEvent={selectedEvent}
              onSelect={selectSuggestion}
              onClose={closeEvent}
              onClear={clearSearch}
              onReset={resetFilters}
              timeError={timeError}
              shortlist={shortlist}
              myNight={myNightOpen}
              onBrowse={() => switchCollection(false)}
            />
            <p className="programme-note">
              {myNightOpen
                ? `${myNight.persistent ? "Saved on this browser and device only." : "Kept for this visit only."} Saving an event does not book a place. After-midnight events appear last.`
                : `${events.length.toLocaleString("en-IE")} events in the programme. Check official listings for updates and admission details.`}
            </p>
          </div>
        </section>
        <section className="map-panel" aria-label="Event map">
          {hasMapLocations ? (
            <>
              <div className="map-caption">
                <span>{myNightOpen ? "My Night" : "All Ireland"}</span>
                <span>Select a pin to see an event</span>
              </div>
              {unmappedEventCount > 0 && (
                <button type="button" className="unmapped-notice" onClick={() => setView("list")}>
                  {unmappedEventCount} events have no map location. View them in the list.
                </button>
              )}
              <Map
                position={IrelandLatLng}
                zoom={7}
                events={visibleEvents}
                selectedUrl={selectedEvent?.url}
                onSelect={setSelectedUrl}
                onClose={closeEvent}
                shortlist={shortlist}
              />
            </>
          ) : (
            <MapEmptyState
              myNight={myNightOpen}
              hasUnmappedEvents={visibleEvents.length > 0 || (myNightOpen && unavailableSavedUrls.length > 0)}
              timeError={timeError}
              onClear={clearSearch}
              onReset={resetFilters}
              onBrowse={() => switchCollection(false)}
              onShowList={() => setView("list")}
            />
          )}
        </section>
      </div>
    </main>
  );
}
