import { useEffect, useId, useRef, useState } from "react";
import { CultureNightEvent } from "@/interfaces/culture-night-event";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";

interface Props {
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  suggestions: CultureNightEvent[];
  selectSuggestion: (event: CultureNightEvent) => void;
  runSearch: () => void;
  clearSearch: () => void;
  hasSelection?: boolean;
}

export default function SearchBox({
  searchTerm, setSearchTerm, suggestions, selectSuggestion, runSearch,
  clearSearch, hasSelection,
}: Props) {
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const visibleSuggestions = suggestions.slice(0, 20);
  const isOpen = showSuggestions && Boolean(searchTerm.trim()) && visibleSuggestions.length > 0;
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
    <div className="search-box">
      <label htmlFor="event-search" className="sr-only">
        Search events
      </label>
      <div className="search-field">
        <MagnifyingGlassIcon className="search-icon" aria-hidden="true" />
        <input
          id="event-search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={isOpen ? listId : undefined}
          aria-activedescendant={activeOption}
          className="search-input"
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
        {(searchTerm || hasSelection) && (
          <button
            type="button"
            className="search-clear icon-button"
            aria-label="Clear search and selection"
            onClick={() => {
              clearSearch();
              setShowSuggestions(false);
              setActiveIndex(-1);
            }}
          >
            <XMarkIcon aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          aria-label="Show matching events"
          className="search-submit"
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
            className="search-suggestions"
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
                  className="search-suggestion"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(event);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  {match < 0 || !length ? event.title : (
                    <>
                      {event.title.slice(0, match)}
                      <mark>{event.title.slice(match, match + length)}</mark>
                      {event.title.slice(match + length)}
                    </>
                  )}
                  <span className="suggestion-meta">
                    {[event.venueName || event.host, event.time].filter(Boolean).join(" - ")}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
