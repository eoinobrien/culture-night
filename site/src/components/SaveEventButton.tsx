import { BookmarkIcon } from "@heroicons/react/24/outline";
import { BookmarkIcon as SavedBookmarkIcon } from "@heroicons/react/24/solid";
import type { CultureNightEvent } from "@/interfaces/culture-night-event";

export type ShortlistControls = {
  urls: ReadonlySet<string>;
  ready: boolean;
  toggle: (url: string) => void;
};

export default function SaveEventButton({
  event, shortlist, compact = false,
}: {
  event: Pick<CultureNightEvent, "title" | "url">;
  shortlist: ShortlistControls;
  compact?: boolean;
}) {
  const saved = shortlist.urls.has(event.url);
  const Icon = saved ? SavedBookmarkIcon : BookmarkIcon;
  return (
    <button
      type="button"
      className={`save-event-button ${compact ? "compact-save" : ""}`}
      aria-label={`${saved ? "Remove" : "Save"} ${event.title} ${saved ? "from" : "to"} My Night`}
      aria-pressed={saved}
      disabled={!shortlist.ready}
      onClick={() => shortlist.toggle(event.url)}
    >
      <Icon aria-hidden="true" />
      {!compact && <span>{saved ? "Saved to My Night" : "Save to My Night"}</span>}
    </button>
  );
}
