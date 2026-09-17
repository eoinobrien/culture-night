"use client";

import { CultureNightEvent } from "@/interfaces/culture-night-event";
import Events from "../api/events.json";
import { programmeDate, programmeYear } from "@/api/programme";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Geocode } from "@/interfaces/geocode";
import SearchBox from "@/components/SearchBox";
import FiltersColumn from "@/components/FiltersColumn";
import EventResults from "@/components/EventResults";
import { AdjustmentsHorizontalIcon, BookmarkIcon, ListBulletIcon, MapIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { availabilityError, filterEvents, searchEvents } from "@/lib/event-filters";
import { reorderSavedUrls, savedEventsInOrder, type MyNightSort } from "@/lib/my-night";
import useMyNight from "@/hooks/useMyNight";
import MyNightTip from "@/components/MyNightTip";
import MapEmptyState from "@/components/MapEmptyState";
import ShareLinkButton from "@/components/ShareLinkButton";
import useUrlState from "@/hooks/useUrlState";
import { createStateLink, defaultUrlState } from "@/lib/url-state";

const IrelandLatLng: Geocode = { lat: 53.4230965, lng: -7.9254405 };
const events: CultureNightEvent[] = Events;
const knownEventUrls = new Set(events.map((event) => event.url));
const Map = dynamic(() => import("@/components/EventMap"), {
  loading: () => <p role="status" className="map-loading">Loading the event map...</p>,
  ssr: false,
});

export default function Home() {
  const { state, ready: urlReady, notice: urlNotice, update } = useUrlState(events, programmeYear);
  const { startTime, endTime, eventType, bookingDetails, ageGroup, searchTerm, selectedUrl, view, collection, sharedUrls, sort } = state;
  const myNightOpen = collection === "my-night";
  const sharedOpen = collection === "shared";
  const eventOpen = collection === "event";
  const browsing = collection === "browse";
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [replaced, setReplaced] = useState(false);
  const cancelReplace = useRef<HTMLButtonElement>(null);
  const myNight = useMyNight(programmeYear);
  const { dismissTip } = myNight;
  const myNightAnchor = useRef<HTMLDivElement>(null);
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
  const savedEvents = useMemo(() => savedEventsInOrder(events, myNight.urls, sort), [myNight.urls, sort]);
  const sharedEvents = useMemo(() => savedEventsInOrder(events, sharedUrls, sort), [sharedUrls, sort]);
  const shortlist = useMemo(() => ({
    urls: new Set(myNight.urls), ready: myNight.ready, toggle: myNight.toggle,
  }), [myNight.urls, myNight.ready, myNight.toggle]);
  const unavailableSavedUrls = myNight.urls.filter((url) => !knownEventUrls.has(url));
  const unavailableSharedCount = sharedUrls.length - sharedEvents.length;
  const missingSharedCount = sharedEvents.filter((event) => !shortlist.urls.has(event.url)).length;
  const linkedEvents = useMemo(() => events.filter((event) => event.url === selectedUrl), [selectedUrl]);
  const visibleEvents = myNightOpen ? savedEvents : sharedOpen ? sharedEvents : eventOpen ? linkedEvents : matchingEvents;
  const selectedEvent = visibleEvents.find((event) => event.url === selectedUrl);
  const timeError = browsing ? availabilityError(startTime, endTime) : undefined;
  const activeFilters = [
    startTime.hour !== 15 || startTime.minute !== 0 || endTime.hour !== 3 || endTime.minute !== 0,
    eventType !== "All", bookingDetails !== "All", ageGroup !== "All",
  ].filter(Boolean).length;
  const unmappedEventCount = visibleEvents.filter((event) => !event.geocode).length;
  const hasMapLocations = visibleEvents.length > unmappedEventCount;
  const resultKey = JSON.stringify([collection, searchTerm, startTime, endTime, eventType, bookingDetails, ageGroup]);

  useEffect(() => {
    if (urlReady && myNight.ready && !eventOpen && selectedUrl && !selectedEvent) update({ selectedUrl: undefined }, "replace");
  }, [urlReady, myNight.ready, eventOpen, selectedUrl, selectedEvent, update]);
  useEffect(() => { resultsPanel.current?.scrollTo({ top: 0 }); }, [resultKey]);
  useEffect(() => { setFiltersOpen(false); }, [collection]);
  useEffect(() => { if (myNightOpen) dismissTip(); }, [myNightOpen, dismissTip]);
  useEffect(() => { setConfirmReplace(false); setReplaced(false); }, [collection, sharedUrls]);
  useEffect(() => { if (confirmReplace) cancelReplace.current?.focus(); }, [confirmReplace]);

  const closeEvent = useCallback((url: string) => {
    update((current) => current.selectedUrl === url
      ? { ...current, selectedUrl: undefined, collection: current.collection === "event" ? "browse" : current.collection }
      : current, "replace");
  }, [update]);

  const changeSearch = (value: string) => {
    update({ searchTerm: value, selectedUrl: undefined }, "replace");
  };
  const runSearch = () => {
    update({ view: "list", selectedUrl: undefined });
    resultsPanel.current?.scrollTo({ top: 0 });
  };
  const selectSuggestion = (event: CultureNightEvent) => {
    update({ selectedUrl: event.url, view: event.geocode ? "map" : "list" });
    if (!event.geocode) resultsPanel.current?.scrollTo({ top: 0 });
  };
  const clearSearch = () => {
    update({ searchTerm: "", selectedUrl: undefined });
  };
  const resetFilters = () => {
    const { startTime, endTime, eventType, bookingDetails, ageGroup } = defaultUrlState();
    update({ startTime, endTime, eventType, bookingDetails, ageGroup });
  };
  const closeFilters = () => {
    setFiltersOpen(false);
    filterButton.current?.focus();
  };
  const switchCollection = (saved: boolean) => {
    myNight.dismissTip();
    update({ collection: saved ? "my-night" : "browse", view: "list", selectedUrl: undefined });
    setFiltersOpen(false);
  };
  const goHome = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!urlReady || event.defaultPrevented || event.button !== 0 ||
      event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    dismissTip();
    setFiltersOpen(false);
    update(defaultUrlState);
    resultsPanel.current?.scrollTo({ top: 0 });
  };
  const getEventLink = useCallback((event: CultureNightEvent) => createStateLink(window.location.href, {
    ...defaultUrlState(), collection: "event", selectedUrl: event.url, view: event.geocode ? "map" : "list",
  }, programmeYear), []);
  const getViewLink = () => createStateLink(window.location.href, myNightOpen ? {
    ...defaultUrlState(), collection: "shared", sharedUrls: savedEvents.map((event) => event.url), sort,
  } : sharedOpen ? {
    ...defaultUrlState(), collection: "shared", sharedUrls, selectedUrl, view, sort,
  } : state, programmeYear);
  const changeSort = (value: string) => {
    if (value !== "time" && value !== "title" && value !== "custom") {
      console.error("Unknown My Night sort option.");
      return;
    }
    const sort: MyNightSort = value;
    update({ sort });
  };
  const reorderEvents = (order: readonly string[]) => {
    if (myNightOpen) {
      myNight.reorder(order);
      update({ sort: "custom" });
    } else {
      update({ sharedUrls: reorderSavedUrls(sharedUrls, order), sort: "custom" });
    }
  };
  const resultsHeading = (
    <div className="results-heading">
      <h2 role="status" aria-live="polite" aria-atomic="true">
        {visibleEvents.length.toLocaleString("en-IE")} {myNightOpen ? "saved " : sharedOpen ? "shared " : ""}{visibleEvents.length === 1 ? "event" : "events"}
      </h2>
      <ShareLinkButton compact getLink={getViewLink} identity={JSON.stringify(state)}
        disabled={!urlReady || (myNightOpen && !savedEvents.length)}
        label={myNightOpen ? "Share My Night" : sharedOpen ? "Share shared night" : eventOpen ? "Share event" : "Share search"} />
    </div>
  );

  return (
    <main className="culture-app">
      <header className="app-header">
        <div className="app-brand">
          <h1><a href="./" aria-label="Culture Night home" onClick={goHome}>Culture Night</a></h1>
          <p>{programmeDate}</p>
        </div>
        <div className="my-night-anchor" ref={myNightAnchor}>
        <button
          type="button"
          className="my-night-toggle"
          aria-label={myNight.ready ? `My Night, ${savedEvents.length} saved ${savedEvents.length === 1 ? "event" : "events"}` : "My Night, loading saved events"}
          aria-pressed={myNightOpen}
          aria-describedby={myNight.showTip && !myNightOpen ? "my-night-tip-message" : undefined}
          disabled={!myNight.ready || !urlReady}
          onClick={() => switchCollection(!myNightOpen)}
        >
          <BookmarkIcon aria-hidden="true" />
          My Night <span className="saved-count" aria-hidden="true">{myNight.ready ? savedEvents.length : "..."}</span>
        </button>
        {myNight.showTip && !myNightOpen && <MyNightTip anchor={myNightAnchor} onDismiss={myNight.dismissTip} />}
        </div>
      </header>
      {myNight.notice && <p role="alert" className="storage-notice">{myNight.notice}</p>}
      {urlNotice && <p role="alert" className="storage-notice">{urlNotice}</p>}
      <div className={`discovery-workspace ${view}-view`}>
        <section className="discovery-sidebar" aria-label="Find events">
          <div className={`discovery-controls ${myNightOpen ? "my-night-controls" : ""}`}>
            {!browsing ? (
              <div className="my-night-intro">
                <h2>{sharedOpen ? "Shared night" : eventOpen ? "Shared event" : "My Night"}</h2>
                <p className={myNightOpen ? "sr-only" : undefined}>{sharedOpen ? "A shared plan. Save only if you choose."
                  : eventOpen ? "From a shared link. Not automatically saved."
                    : `${myNight.persistent ? "Saved in this browser." : "Kept for this visit only."} ${sort === "time" ? "Ordered by start time." : sort === "title" ? "Ordered by title." : "Your custom order."}`}</p>
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
            {myNightOpen && resultsHeading}
            <div className="discovery-toolbar">
              {!browsing ? (
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
                <button type="button" aria-pressed={view === "list"} onClick={() => update({ view: "list" })}>
                  <ListBulletIcon aria-hidden="true" /> List
                </button>
                <button type="button" aria-pressed={view === "map"} onClick={() => update({ view: "map" })}>
                  <MapIcon aria-hidden="true" /> Map
                </button>
              </div>
              {!browsing && <span className="scope-label">{sharedOpen ? "Shared plan" : myNightOpen ? "Your shortlist" : "Event link"}</span>}
            </div>
            {!myNightOpen && resultsHeading}
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
                  setStartTime={(startTime) => update({ startTime })}
                  setEndTime={(endTime) => update({ endTime })}
                  eventType={eventType}
                  setEventType={(eventType) => update({ eventType })}
                  bookingDetails={bookingDetails}
                  setBookingDetails={(bookingDetails) => update({ bookingDetails })}
                  ageGroup={ageGroup}
                  setAgeGroup={(ageGroup) => update({ ageGroup })}
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
            {(myNightOpen || sharedOpen) && (
              <div className="night-sort">
                <label htmlFor="night-sort">Sort events</label>
                <select id="night-sort" value={sort} onChange={(event) => changeSort(event.target.value)}>
                  <option value="time">Start time</option>
                  <option value="title">Title</option>
                  <option value="custom">Custom order</option>
                </select>
              </div>
            )}
            {(myNightOpen || sharedOpen) && <p className="sort-help">Drag Reorder or use the arrows. Moving an event switches to Custom order.</p>}
            {sharedOpen && (
              <section className="shared-plan-actions" aria-label="Save shared plan">
                <p>Add all keeps your existing saves. Replacing requires confirmation.</p>
                <div className="plan-import-buttons">
                  <button type="button" className="primary-button" disabled={!myNight.ready || !missingSharedCount}
                    onClick={() => { myNight.add(sharedEvents.map((event) => event.url)); setConfirmReplace(false); }}>Add all to My Night</button>
                  <button type="button" className="danger-button" disabled={!myNight.ready || !sharedEvents.length || confirmReplace}
                    onClick={() => setConfirmReplace(true)}>Replace My Night</button>
                </div>
                {confirmReplace && (
                  <section className="replace-confirmation" aria-label="Confirm replacing My Night">
                    <p>This will replace all your saved events with the {sharedEvents.length} available events in this shared plan. Other saved events will be removed.</p>
                    <div className="plan-import-buttons">
                      <button ref={cancelReplace} type="button" className="text-button" onClick={() => setConfirmReplace(false)}>Cancel replacement</button>
                      <button type="button" className="danger-button" onClick={() => {
                        myNight.replace(sharedEvents.map((event) => event.url));
                        setConfirmReplace(false);
                        setReplaced(true);
                      }}>Confirm replacement</button>
                    </div>
                  </section>
                )}
                {myNight.ready && sharedEvents.length > 0 && missingSharedCount === 0 && <p role="status">{replaced ? "My Night now contains this shared plan." : "All available events are in My Night."}</p>}
                {unavailableSharedCount > 0 && <p role="status">{unavailableSharedCount} shared {unavailableSharedCount === 1 ? "event is" : "events are"} no longer available in this programme and will not be added.</p>}
              </section>
            )}
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
              collection={collection}
              getEventLink={getEventLink}
              onReorder={myNightOpen || sharedOpen ? reorderEvents : undefined}
              onBrowse={() => switchCollection(false)}
            />
            <p className="programme-note">
              {sharedOpen
                ? "This link is a snapshot, not a live shared plan. Changing its order does not change your My Night. Saving an event does not book a place."
                : myNightOpen
                ? `${myNight.persistent ? "Saved on this browser and device only." : "Kept for this visit only."} Saving an event does not book a place. ${sort === "time" ? "After-midnight events appear last." : "Your sort choice is kept in the URL."}`
                : `${events.length.toLocaleString("en-IE")} events in the programme. Check official listings for updates and admission details.`}
            </p>
          </div>
        </section>
        <section className="map-panel" aria-label="Event map">
          {!urlReady ? <p role="status" className="map-loading">Restoring the event view...</p> : hasMapLocations ? (
            <>
              <div className="map-caption">
                {!browsing && <span className="map-scope">{sharedOpen ? "Shared night" : myNightOpen ? "My Night" : "Shared event"}</span>}
                <span className="map-help">Select a pin to see an event</span>
              </div>
              {unmappedEventCount > 0 && (
                <button type="button" className="unmapped-notice" onClick={() => update({ view: "list" })}>
                  {unmappedEventCount} events have no map location. View them in the list.
                </button>
              )}
              <Map
                position={IrelandLatLng}
                zoom={7}
                events={visibleEvents}
                selectedUrl={selectedEvent?.url}
                onSelect={(selectedUrl) => update({ selectedUrl })}
                onClose={closeEvent}
                shortlist={shortlist}
                getEventLink={getEventLink}
              />
            </>
          ) : (
            <MapEmptyState
              myNight={myNightOpen}
              shared={sharedOpen || eventOpen}
              hasUnmappedEvents={visibleEvents.length > 0 || (myNightOpen && unavailableSavedUrls.length > 0)}
              timeError={timeError}
              onClear={clearSearch}
              onReset={resetFilters}
              onBrowse={() => switchCollection(false)}
              onShowList={() => update({ view: "list" })}
            />
          )}
        </section>
      </div>
    </main>
  );
}
