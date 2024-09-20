"use client";

import { CultureNightEvent } from "@/interfaces/culture-night-event";

import Events from "../api/events.json";
import dynamic from "next/dynamic";
import { SetStateAction, useMemo, useState } from "react";
import { Geocode } from "@/interfaces/geocode";
import { Time } from "@/interfaces/time";
import MapFilter from "@/components/MapFilter";

const IrelandLatLng: Geocode = { lat: 53.4230965, lng: -7.9254405 };

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

const adjustHoursPastMidnight = (hour: number): number => {
  return hour < 15 ? hour + 24 : hour;
};

const compareTime = (a: Time, b: Time): number => {
  const aHour = adjustHoursPastMidnight(a.hour);
  const bHour = adjustHoursPastMidnight(b.hour);

  if (aHour < bHour || (aHour === bHour && a.minute < b.minute)) {
    return -1;
  }

  if (aHour === bHour && a.minute === b.minute) {
    return 0;
  }

  return 1;
};

const filterEventByTime = (
  filterStartTime: Time,
  filterEndTime: Time,
  event: CultureNightEvent
): boolean => {
  // filter: 15:00 - 16:00, event: 16:00 – 16:45 = hide
  if (compareTime(filterEndTime, event.startTime) <= 0) {
    return false;
  }

  // all events that occur inside filter
  // filter: 15:00 - 16:00, event: 15:15 - 15:45 = show
  if (
    compareTime(filterStartTime, event.startTime) <= 0 &&
    compareTime(filterEndTime, event.endTime) > 0
  ) {
    return true;
  }

  // all events that occur inside filter
  // filter: 15:15 - 15:15, event: 15:00 - 16:00 = show
  if (
    compareTime(filterStartTime, event.startTime) >= 0 &&
    compareTime(filterEndTime, event.endTime) <= 0
  ) {
    return true;
  }

  return false;
};

const filterEventByStringFilter = (
  filter: string,
  eventValue: string
): boolean => {
  if (filter === "All") {
    return true;
  }

  return filter === eventValue;
};

export default function Home() {
  const events = Events as CultureNightEvent[];

  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [selectedGenre, setSelectedGenre] = useState<string[]>([]);
  const [startTime, setStartTime] = useState<Time>({ hour: 15, minute: 0 });
  const [endTime, setEndTime] = useState<Time>({ hour: 3, minute: 0 });
  const [eventType, setEventType] = useState<string>("All");
  const [bookingDetails, setBookingDetails] = useState<string>("All");
  const [ageGroup, setAgeGroup] = useState<string>("All");

  const Map = useMemo(
    () =>
      dynamic(() => import("@/components/EventMap"), {
        loading: () => <p>Map is loading</p>,
        ssr: false,
      }),
    []
  );

  return (
    <div className="max-h-svh">
      <div className="mx-auto max-w-2xl ring-1 ring-gray-200 flex flex-shrink-1 lg:max-w-none">
        <div className="p-8 sm:p-10 lg:flex-auto">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-8">
            Culture Night
          </h1>
          <h3 className="text-xl font-bold tracking-tight text-gray-900">
            Time Period
          </h3>
          <h4 className="tracking-tight text-gray-900">
            Any events that falls within your selected period will be returned.
          </h4>
          <div className="md:flex md:items-center mb-6">
            <div className="md:w-1/3">
              <label
                className="block text-gray-500 font-bold md:text-right mb-1 md:mb-0 pr-4"
                htmlFor="inline-start-time"
              >
                Start Time
              </label>
            </div>
            <div className="relative">
              <select
                className="block appearance-none w-full bg-gray-100 border border-gray-200 text-gray-700 py-3 px-4 pr-8 rounded leading-tight focus:outline-none focus:bg-white focus:border-gray-500"
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
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
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
          <div className="md:flex md:items-center mb-6">
            <div className="md:w-1/3">
              <label
                className="block text-gray-500 font-bold md:text-right mb-1 md:mb-0 pr-4"
                htmlFor="inline-end-time"
              >
                End Time
              </label>
            </div>
            <div className="relative">
              <select
                className="block appearance-none w-full bg-gray-100 border border-gray-200 text-gray-700 py-3 px-4 pr-8 rounded leading-tight focus:outline-none focus:bg-white focus:border-gray-500"
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
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
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
            options={events.map((e) => e.ageGroup)}
            filterValue={ageGroup}
            setFilter={setAgeGroup}
          />
        </div>
        <div className="-mt-2 lg:mt-0 w-full max-w-2/5 flex-shrink-1">
          <div className="bg-gray-50 text-center ring-1 ring-inset ring-gray-900/5 lg:flex lg:flex-col lg:justify-center">
            <Map
              position={IrelandLatLng}
              zoom={7}
              events={events.filter(
                (e) =>
                  filterEventByTime(startTime, endTime, e) &&
                filterEventByStringFilter(eventType, e.eventType) &&
                filterEventByStringFilter(bookingDetails, e.bookingDetails) &&
                filterEventByStringFilter(ageGroup, e.ageGroup)
              )}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
