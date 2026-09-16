import { useEffect, useId, useRef, useState } from "react";
import { CultureNightEvent } from "@/interfaces/culture-night-event";
import PopupEventDetails from "./PopupEventDetails";

interface Props {
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  suggestions: CultureNightEvent[];
  selectSuggestion: (event: CultureNightEvent) => void;
  runSearch: () => void;
  clearSearch: () => void;
  selectedEvent?: CultureNightEvent;
  message?: string;
}

export default function SearchBox({
  searchTerm, setSearchTerm, suggestions, selectSuggestion, runSearch,
  clearSearch, selectedEvent, message,
}: Props) {
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const visibleSuggestions = suggestions.slice(0, 20);
  const isOpen = showSuggestions && visibleSuggestions.length > 0;
  const activeOption = isOpen && activeIndex >= 0 && activeIndex < visibleSuggestions.length
    ? `${listId}-${activeIndex}` : undefined;

  useEffect(() => setActiveIndex(-1), [suggestions, searchTerm]);
  useEffect(() => {
    if (activeOption) {
      listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
    }
  }, [activeOption]);

  const choose = (event: CultureNightEvent) => {
    selectSuggestion(event);
    setShowSuggestions(false);
    setActiveIndex(-1);
  };
  const submit = () => {
    runSearch();
    setShowSuggestions(false);
    setActiveIndex(-1);
  };

  return (
    <div className="mb-6">
      <label htmlFor="event-search" className="block text-gray-300 font-bold mb-1">
        Search events
      </label>
      <div className="relative">
        <input
          id="event-search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={isOpen ? listId : undefined}
          aria-activedescendant={activeOption}
          className="w-full bg-gray-700 border border-gray-800 text-gray-200 py-2 pl-3 pr-16 rounded placeholder-gray-400"
          placeholder="Search events, places or venues"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setShowSuggestions(true);
            setActiveIndex(-1);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const option = activeOption ? visibleSuggestions[activeIndex] : undefined;
              if (option) choose(option);
              else submit();
            } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setShowSuggestions(true);
              const count = visibleSuggestions.length;
              if (!count) setActiveIndex(-1);
              else if (!isOpen || activeIndex < 0) {
                setActiveIndex(e.key === "ArrowDown" ? 0 : count - 1);
              } else {
                setActiveIndex((activeIndex + (e.key === "ArrowDown" ? 1 : -1) + count) % count);
              }
            } else if (e.key === "Escape") {
              setShowSuggestions(false);
              setActiveIndex(-1);
            }
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setShowSuggestions(false)}
        />
        <button
          type="button"
          aria-label="Go to event"
          className="absolute right-1 top-1 bottom-1 px-3 bg-green-600 hover:bg-green-700 text-white rounded focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-green-400"
          onClick={submit}
        >
          Go
        </button>
        {isOpen && (
          <ul
            id={listId}
            ref={listRef}
            role="listbox"
            aria-label="Matching events"
            className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded bg-gray-800 border border-gray-700"
          >
            {visibleSuggestions.map((event, index) => {
              const match = event.title.toLowerCase().indexOf(searchTerm.trim().toLowerCase());
              const length = searchTerm.trim().length;
              return (
                <li
                  id={`${listId}-${index}`}
                  key={event.url}
                  role="option"
                  aria-selected={activeIndex === index}
                  className={`px-3 py-2 cursor-pointer hover:bg-gray-700 whitespace-normal break-words ${activeIndex === index ? "bg-gray-700" : ""}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(event);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  {match < 0 || !length ? event.title : (
                    <>
                      {event.title.slice(0, match)}
                      <span className="bg-yellow-600 text-black">{event.title.slice(match, match + length)}</span>
                      {event.title.slice(match + length)}
                    </>
                  )}
                  <span className="block text-xs text-gray-400">
                    {[event.venueName || event.host, event.time].filter(Boolean).join(" - ")}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {message && <p role="status" className="mt-3 text-sm">{message}</p>}
      {(searchTerm || selectedEvent) && (
        <button
          type="button"
          className="mt-2 rounded bg-gray-600 px-3 py-2 text-sm"
          onClick={() => {
            clearSearch();
            setShowSuggestions(false);
            setActiveIndex(-1);
          }}
        >
          Clear search and selection
        </button>
      )}
      {selectedEvent && (
        <section aria-label="Selected event" className="mt-3 rounded bg-gray-800 px-3 py-2">
          {selectedEvent.geocode === null ? (
            <>
              <p className="mb-2 text-sm text-gray-300">No map location available</p>
              <PopupEventDetails event={selectedEvent} />
            </>
          ) : (
            <div className="text-sm">
              <h2 className="font-semibold break-words">{selectedEvent.title}</h2>
              {selectedEvent.venueName && <p className="text-xs text-gray-400">{selectedEvent.venueName}</p>}
              <a href={selectedEvent.url} target="_blank" rel="noreferrer" className="text-xs underline">
                Culture Night Event Page
              </a>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
