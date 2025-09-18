import React, { Dispatch, SetStateAction } from "react";
import { CultureNightEvent } from "@/interfaces/culture-night-event";

interface Props {
  searchTerm: string;
  setSearchTerm: (s: string) => void;
  showSuggestions: boolean;
  setShowSuggestions: Dispatch<SetStateAction<boolean>>;
  activeIndex: number;
  setActiveIndex: Dispatch<SetStateAction<number>>;
  suggestions: string[];
  selectSuggestion: (title: string) => void;
  runSearch: () => void;
  setSelectedTitle: (t?: string) => void;
  selectedEvent?: CultureNightEvent | undefined;
}

export default function SearchBox({
  searchTerm,
  setSearchTerm,
  showSuggestions,
  setShowSuggestions,
  activeIndex,
  setActiveIndex,
  suggestions,
  selectSuggestion,
  runSearch,
  setSelectedTitle,
  selectedEvent,
}: Props) {
  return (
    <div className="mb-6">
      <label
        htmlFor="event-search"
        className="block text-gray-300 font-bold mb-1"
      >
        Search events
      </label>
      <div className="relative">
        <div className="relative w-full">
          <input
            id="event-search"
            aria-autocomplete="list"
            aria-controls="events-listbox"
            aria-label="Search events"
            className="w-full bg-gray-700 border border-gray-800 text-gray-200 py-2 pl-3 pr-14 rounded placeholder-gray-400"
            placeholder="Type event title"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (showSuggestions && activeIndex >= 0) {
                  const title = suggestions[activeIndex];
                  if (title) selectSuggestion(title);
                  return;
                }
                runSearch();
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                setShowSuggestions(true);
                setActiveIndex(
                  (i) => (i + 1 + suggestions.length) % suggestions.length
                );
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex(
                  (i) => (i - 1 + suggestions.length) % suggestions.length
                );
              } else if (e.key === "Escape") {
                setShowSuggestions(false);
              }
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            aria-activedescendant={
              activeIndex >= 0 ? `suggestion-${activeIndex}` : undefined
            }
          />

          <div className="absolute right-1 top-1 bottom-1 flex items-center gap-1">
            <button
              aria-label="Go to event"
              className="h-full px-3 bg-green-600 hover:bg-green-700 text-white rounded focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-green-400"
              onClick={() => runSearch()}
            >
              Go
            </button>
          </div>
        </div>
      </div>

      {/* custom suggestions */}
      <div id="events-listbox" role="listbox" className="relative">
        {showSuggestions && suggestions.length > 0 && (
          <ul
            className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded bg-gray-800 border border-gray-700"
            role="listbox"
          >
            {suggestions.slice(0, 20).map((title, i) => (
              <li
                id={`suggestion-${i}`}
                key={title}
                role="option"
                aria-selected={activeIndex === i}
                className={`px-3 py-2 cursor-pointer hover:bg-gray-700 whitespace-normal break-words ${
                  activeIndex === i ? "bg-gray-700" : ""
                }`}
                onMouseDown={(ev) => {
                  ev.preventDefault();
                  selectSuggestion(title);
                }}
                onMouseEnter={() => setActiveIndex(i)}
                tabIndex={-1}
              >
                {/* highlight match */}
                {(() => {
                  const term = searchTerm.trim().toLowerCase();
                  if (!term) return title;
                  const idx = title.toLowerCase().indexOf(term);
                  if (idx === -1) return title;
                  return (
                    <>
                      {title.substring(0, idx)}
                      <span className="bg-yellow-600 text-black">
                        {title.substring(idx, idx + term.length)}
                      </span>
                      {title.substring(idx + term.length)}
                    </>
                  );
                })()}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* selected preview */}
      {selectedEvent && (
        <div className="mt-3 flex items-center gap-3 rounded bg-gray-800 px-3 py-2">
          <div className="text-sm grow">
            <div className="font-semibold max-w-[40ch] break-words">
              {selectedEvent.title}
            </div>
            {selectedEvent.venueName && (
              <div className="text-xs text-gray-400">
                {selectedEvent.venueName}
              </div>
            )}
          </div>
          <button
            aria-label="Clear selection"
            className="ml-2 px-2 py-1 bg-gray-600 rounded text-white"
            onClick={() => {
              setSelectedTitle(undefined);
              setSearchTerm("");
              setShowSuggestions(false);
            }}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
