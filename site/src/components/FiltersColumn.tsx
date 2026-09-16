import MapFilter from "@/components/MapFilter";
import { Time } from "@/interfaces/time";
import { CultureNightEvent } from "@/interfaces/culture-night-event";

interface Props {
  startTime: Time;
  endTime: Time;
  setStartTime: (t: Time) => void;
  setEndTime: (t: Time) => void;
  eventType: string;
  setEventType: (value: string) => void;
  bookingDetails: string;
  setBookingDetails: (value: string) => void;
  ageGroup: string;
  setAgeGroup: (value: string) => void;
  events: CultureNightEvent[];
}

const timeOptions = Array.from({ length: 49 }, (_, index) => {
  const minutes = (15 * 60 + index * 15) % (24 * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});
const timeString = (time: Time) =>
  `${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`;
const parseTime = (value: string): Time => {
  const [hour, minute] = value.split(":").map(Number);
  return { hour, minute };
};

export default function FiltersColumn({
  startTime, endTime, setStartTime, setEndTime, eventType, setEventType,
  bookingDetails, setBookingDetails, ageGroup, setAgeGroup, events,
}: Props) {
  return (
    <div className="filter-fields">
      <p id="availability-help" className="filter-help">
        Events overlapping your availability, including after midnight.
        Check each event for fixed start times and admission rules.
      </p>
      <div className="availability-fields">
        <MapFilter label="Available from" options={timeOptions} filterValue={timeString(startTime)}
          setFilter={(value) => setStartTime(parseTime(value))} includeAll={false} describedBy="availability-help" />
        <MapFilter label="Available until" options={timeOptions} filterValue={timeString(endTime)}
          setFilter={(value) => setEndTime(parseTime(value))} includeAll={false} describedBy="availability-help" />
      </div>
      <MapFilter label="Event type" options={events.map((event) => event.eventType)}
        filterValue={eventType} setFilter={setEventType} />
      <MapFilter label="Booking details" options={events.map((event) => event.bookingDetails)}
        filterValue={bookingDetails} setFilter={setBookingDetails} />
      <MapFilter label="Age group" options={events.map((event) => event.ageGroup).filter(Boolean).sort((a, b) => a.localeCompare(b))}
        filterValue={ageGroup} setFilter={setAgeGroup} />
    </div>
  );
}
