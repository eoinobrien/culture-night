import { LatLng } from "leaflet";
import { Geocode } from "./geocode";
import { UrlWithTitle } from "./url-with-title"

export type CultureNightEvent = {
    title: string;
    image: string;
    url: string;
    description: string;
    locations: UrlWithTitle[],
    time: string;
    startTime: string;
    endTime: string;
    features: string[],
    host: string; 
    eventType: string; 
    bookingDetails: string;
    bookingLink: string | null;
    onlineContentLink: string | null;
    ageGroup: string;
    venueName: string | null;
    fullAddress: string;
    genres: UrlWithTitle[],
    geocode: Geocode,
}