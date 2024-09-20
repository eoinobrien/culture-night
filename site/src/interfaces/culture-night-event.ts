import { Geocode } from "./geocode";
import { UrlWithTitle } from "./url-with-title"
import { Time } from "./time";

export type CultureNightEvent = {
    title: string;
    image: string;
    url: string;
    description: string;
    locations: UrlWithTitle[],
    time: string;
    startTime: Time;
    endTime: Time;
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