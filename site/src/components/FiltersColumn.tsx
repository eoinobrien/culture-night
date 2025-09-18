import React, { Dispatch, SetStateAction } from "react";
import MapFilter from "@/components/MapFilter";
import { Time } from "@/interfaces/time";
import { CultureNightEvent } from "@/interfaces/culture-night-event";

interface Props {
  startTime: Time;
  endTime: Time;
  setStartTime: (t: Time) => void;
  setEndTime: (t: Time) => void;
  eventType: string;
  setEventType: Dispatch<SetStateAction<string>>;
  bookingDetails: string;
  setBookingDetails: Dispatch<SetStateAction<string>>;
  ageGroup: string;
  setAgeGroup: Dispatch<SetStateAction<string>>;
  events: CultureNightEvent[];
}

export default function FiltersColumn({
  startTime,
  endTime,
  setStartTime,
  setEndTime,
  eventType,
  setEventType,
  bookingDetails,
  setBookingDetails,
  ageGroup,
  setAgeGroup,
  events,
}: Props) {
  const parseTimeToString = (time: Time): string => {
    return `${time.hour.toLocaleString("en-IE", {
      minimumIntegerDigits: 2,
      useGrouping: false,
    })}:${time.minute.toLocaleString("en-IE", {
      minimumIntegerDigits: 2,
      useGrouping: false,
    })}`;
  };

  const stringToTime = (str: string): Time => {
    return {
      hour: Number(str.split(":")[0]),
      minute: Number(str.split(":")[1]),
    };
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xl font-bold tracking-tight">Filters</h3>
      </div>
      <div>
        <div className="flex items-center mb-4">
          <div className="w-1/3 md:w-1/4">
            <label
              className="block text-gray-300 font-bold text-right mb-1 md:mb-0 pr-4"
              htmlFor="inline-start-time"
            >
              Start Time
            </label>
          </div>
          <div className="relative grow">
            <select
              className="block appearance-none w-full bg-gray-700 border border-gray-800 text-gray-200 py-3 px-4 pr-8 rounded leading-tight focus:outline-none focus:bg-gray-600 focus:border-gray-500"
              id="inline-start-time"
              value={parseTimeToString(startTime)}
              onChange={(e) => setStartTime(stringToTime(e.target.value))}
            >
              <option>15:00</option>
              <option>15:15</option>
              <option>15:30</option>
              <option>15:45</option>
              <option>16:00</option>
              <option>16:15</option>
              <option>16:30</option>
              <option>16:45</option>
              <option>17:00</option>
              <option>17:15</option>
              <option>17:30</option>
              <option>17:45</option>
              <option>18:00</option>
              <option>18:15</option>
              <option>18:30</option>
              <option>18:45</option>
              <option>19:00</option>
              <option>19:15</option>
              <option>19:30</option>
              <option>19:45</option>
              <option>20:00</option>
              <option>20:15</option>
              <option>20:30</option>
              <option>20:45</option>
              <option>21:00</option>
              <option>21:15</option>
              <option>21:30</option>
              <option>21:45</option>
              <option>22:00</option>
              <option>22:15</option>
              <option>22:30</option>
              <option>22:45</option>
              <option>23:00</option>
              <option>23:15</option>
              <option>23:30</option>
              <option>23:45</option>
              <option>00:00</option>
              <option>00:15</option>
              <option>00:30</option>
              <option>00:45</option>
              <option>01:00</option>
              <option>01:15</option>
              <option>01:30</option>
              <option>01:45</option>
              <option>02:00</option>
              <option>02:15</option>
              <option>02:30</option>
              <option>02:45</option>
              <option>03:00</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-200">
              <svg
                className="fill-current h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
              >
                <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="flex items-center mb-4">
          <div className="w-1/3 md:w-1/4">
            <label
              className="block text-gray-300 font-bold text-right mb-1 md:mb-0 pr-4"
              htmlFor="inline-end-time"
            >
              End Time
            </label>
          </div>
          <div className="relative grow">
            <select
              className="block appearance-none w-full bg-gray-700 border border-gray-800 text-gray-200 py-3 px-4 pr-8 rounded leading-tight focus:outline-none focus:bg-gray-600 focus:border-gray-500"
              id="inline-end-time"
              value={parseTimeToString(endTime)}
              onChange={(e) => setEndTime(stringToTime(e.target.value))}
            >
              <option>15:00</option>
              <option>15:15</option>
              <option>15:30</option>
              <option>15:45</option>
              <option>16:00</option>
              <option>16:15</option>
              <option>16:30</option>
              <option>16:45</option>
              <option>17:00</option>
              <option>17:15</option>
              <option>17:30</option>
              <option>17:45</option>
              <option>18:00</option>
              <option>18:15</option>
              <option>18:30</option>
              <option>18:45</option>
              <option>19:00</option>
              <option>19:15</option>
              <option>19:30</option>
              <option>19:45</option>
              <option>20:00</option>
              <option>20:15</option>
              <option>20:30</option>
              <option>20:45</option>
              <option>21:00</option>
              <option>21:15</option>
              <option>21:30</option>
              <option>21:45</option>
              <option>22:00</option>
              <option>22:15</option>
              <option>22:30</option>
              <option>22:45</option>
              <option>23:00</option>
              <option>23:15</option>
              <option>23:30</option>
              <option>23:45</option>
              <option>00:00</option>
              <option>00:15</option>
              <option>00:30</option>
              <option>00:45</option>
              <option>01:00</option>
              <option>01:15</option>
              <option>01:30</option>
              <option>01:45</option>
              <option>02:00</option>
              <option>02:15</option>
              <option>02:30</option>
              <option>02:45</option>
              <option>03:00</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-200">
              <svg
                className="fill-current h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
              >
                <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
              </svg>
            </div>
          </div>
        </div>

        <MapFilter
          label="Event type"
          options={events.map((e) => e.eventType)}
          filterValue={eventType}
          setFilter={setEventType}
        />

        <MapFilter
          label="Booking details"
          options={events.map((e) => e.bookingDetails)}
          filterValue={bookingDetails}
          setFilter={setBookingDetails}
        />

        <MapFilter
          label="Age group"
          options={events
            .map((e) => e.ageGroup)
            .filter((f) => f !== null)
            .filter((v, i, a) => a.indexOf(v) === i)
            .sort((a, b) => a.localeCompare(b))}
          filterValue={ageGroup}
          setFilter={setAgeGroup}
        />
      </div>
    </div>
  );
}