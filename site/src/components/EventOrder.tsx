"use client";

import type { ReactNode } from "react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDownIcon, ArrowUpIcon } from "@heroicons/react/24/outline";
import type { CultureNightEvent } from "@/interfaces/culture-night-event";

export function EventOrderContext({ events, onReorder, children }: {
  events: CultureNightEvent[];
  onReorder?: (order: string[]) => void;
  children: ReactNode;
}) {
  const urls = events.map((event) => event.url);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, scrollBehavior: "auto" })
  );
  const title = (id: string | number) => events.find((event) => event.url === id)?.title || "Event";
  return (
    <DndContext id="event-order" sensors={sensors} collisionDetection={closestCenter}
      accessibility={{ announcements: {
        onDragStart: ({ active }) => `Picked up ${title(active.id)}.`,
        onDragOver: ({ active, over }) => over ? `${title(active.id)} is at position ${urls.indexOf(String(over.id)) + 1}.` : undefined,
        onDragEnd: ({ active, over }) => over ? `Placed ${title(active.id)} at position ${urls.indexOf(String(over.id)) + 1}.` : "Reordering cancelled.",
        onDragCancel: () => "Reordering cancelled.",
      } }}
      onDragEnd={({ active, over }) => {
        if (!onReorder || !over || active.id === over.id) return;
        const from = urls.indexOf(String(active.id));
        const to = urls.indexOf(String(over.id));
        if (from < 0 || to < 0) {
          console.warn("The plan changed while an event was being moved.");
          return;
        }
        onReorder(arrayMove(urls, from, to));
      }}>
      <SortableContext items={urls} strategy={verticalListSortingStrategy}>{children}</SortableContext>
    </DndContext>
  );
}

export function SortableEventResult({ event, index, count, onMove, children }: {
  event: CultureNightEvent;
  index: number;
  count: number;
  onMove?: (direction: -1 | 1) => void;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: event.url, disabled: !onMove });
  return (
    <li ref={setNodeRef} className={`event-result ${onMove ? "reorderable" : ""} ${isDragging ? "is-dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}>
      {children}
      {onMove && (
        <div className="event-order-actions">
          <button ref={setActivatorNodeRef} type="button" className="event-order-handle" {...attributes} {...listeners}
            aria-label={`Reorder ${event.title}`} title="Drag to reorder">
            <svg viewBox="0 0 12 20" fill="currentColor" aria-hidden="true">
              <circle cx="3" cy="4" r="1.5" /><circle cx="9" cy="4" r="1.5" />
              <circle cx="3" cy="10" r="1.5" /><circle cx="9" cy="10" r="1.5" />
              <circle cx="3" cy="16" r="1.5" /><circle cx="9" cy="16" r="1.5" />
            </svg>
            <span>Reorder</span>
          </button>
          <button type="button" disabled={index === 0} aria-label={`Move ${event.title} up`}
            title="Move up" onClick={() => onMove(-1)}><ArrowUpIcon aria-hidden="true" /></button>
          <button type="button" disabled={index === count - 1} aria-label={`Move ${event.title} down`}
            title="Move down" onClick={() => onMove(1)}><ArrowDownIcon aria-hidden="true" /></button>
        </div>
      )}
    </li>
  );
}
