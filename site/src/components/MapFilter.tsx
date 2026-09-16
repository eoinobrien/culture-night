"use client";

type MapFilterProps = {
  label: string;
  options: string[];
  filterValue: string;
  setFilter: (value: string) => void;
  includeAll?: boolean;
  describedBy?: string;
};

export default function MapFilter({
  label,
  options,
  filterValue,
  setFilter,
  includeAll = true,
  describedBy,
}: MapFilterProps) {
  return (
    <div className="filter-field">
      <label htmlFor={`inline-${label.replaceAll(" ", "-").toLowerCase()}`}>
        {label}
      </label>
      <select
        id={`inline-${label.replaceAll(" ", "-").toLowerCase()}`}
        aria-describedby={describedBy}
        value={filterValue}
        onChange={(e) => setFilter(e.target.value)}
      >
        {includeAll && <option>All</option>}
        {options
          .filter((value, index) => options.indexOf(value) === index)
          .map((option) => (
            <option key={option}>{option}</option>
          ))}
      </select>
    </div>
  );
}
