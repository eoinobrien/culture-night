"use client";

import { Dispatch, SetStateAction } from "react";

type MapFilterProps = {
  label: string;
  options: string[];
  filterValue: string;
  setFilter: Dispatch<SetStateAction<string>>;
};

export default function MapFilter({
  label,
  options,
  filterValue,
  setFilter,
}: MapFilterProps) {
  return (
    <div className="md:flex md:items-center mb-6">
      <div className="md:w-1/3">
        <label
          className="block text-gray-500 font-bold md:text-right mb-1 md:mb-0 pr-4"
          htmlFor="inline-end-time"
        >
          {label}
        </label>
      </div>
      <div className="relative">
        <select
          className="block appearance-none w-full bg-gray-100 border border-gray-200 text-gray-700 py-3 px-4 pr-8 rounded leading-tight focus:outline-none focus:bg-white focus:border-gray-500"
          id="inline-end-time"
          value={filterValue}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option>All</option>
          {options
            .filter((value, index) => options.indexOf(value) === index)
            .map((option) => (
              <option>{option}</option>
            ))}
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
  );
}
