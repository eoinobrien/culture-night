import Image from "next/image";
import { CultureNightEvent } from "@/interfaces/event";

import Events from "../api/events.json";
import dynamic from "next/dynamic";
import { useMemo } from "react";
import { Geocode } from "@/interfaces/geocode";

const IrelandLatLng: Geocode = { lat: 53.4230965, lng: -7.9254405 };

export default function Home() {
  const Map = useMemo(
    () =>
      dynamic(() => import("@/components/EventMap"), {
        loading: () => <p>A map is loading</p>,
        ssr: false,
      }),
    []
  );

  return (
    <div className="max-h-svh">
      <div className="mx-auto max-w-2xl ring-1 ring-gray-200 flex flex-shrink-1 lg:max-w-none">
        <div className="p-8 sm:p-10 lg:flex-auto">
          <h3 className="text-2xl font-bold tracking-tight text-gray-900">
            Lifetime membership
          </h3>
          <p className="mt-6 text-base leading-7 text-gray-600">
            Lorem ipsum dolor sit amet consect etur adipisicing elit. Itaque
            amet indis perferendis blanditiis repellendus etur quidem assumenda.
          </p>
          <div className="mt-10 flex items-center gap-x-4">
            <h4 className="flex-none text-sm font-semibold leading-6 text-indigo-600">
              What’s included
            </h4>
            <div className="h-px flex-auto bg-gray-100"></div>
          </div>
          <ul
            role="list"
            className="mt-8 grid grid-cols-1 gap-4 text-sm leading-6 text-gray-600 sm:grid-cols-2 sm:gap-6"
          >
            <li className="flex gap-x-3">
              <svg
                className="h-6 w-5 flex-none text-indigo-600"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fill-rule="evenodd"
                  d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                  clip-rule="evenodd"
                />
              </svg>
              Private forum access
            </li>
            <li className="flex gap-x-3">
              <svg
                className="h-6 w-5 flex-none text-indigo-600"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fill-rule="evenodd"
                  d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                  clip-rule="evenodd"
                />
              </svg>
              Member resources
            </li>
            <li className="flex gap-x-3">
              <svg
                className="h-6 w-5 flex-none text-indigo-600"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fill-rule="evenodd"
                  d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                  clip-rule="evenodd"
                />
              </svg>
              Entry to annual conference
            </li>
            <li className="flex gap-x-3">
              <svg
                className="h-6 w-5 flex-none text-indigo-600"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fill-rule="evenodd"
                  d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                  clip-rule="evenodd"
                />
              </svg>
              Official member t-shirt
            </li>
          </ul>
        </div>
        <div className="-mt-2 lg:mt-0 w-full max-w-2/5 flex-shrink-1">
          <div className="bg-gray-50 text-center ring-1 ring-inset ring-gray-900/5 lg:flex lg:flex-col lg:justify-center">
              <Map
                position={IrelandLatLng}
                zoom={7}
                events={Events as CultureNightEvent[]}
              />
          </div>
        </div>
      </div>
    </div>
  );
}
