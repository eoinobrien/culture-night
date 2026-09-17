import Home from "../../page";
import { programmeYear } from "@/api/programme";
import { urlFormatVersion } from "@/lib/url-state";

export const dynamicParams = false;

export function generateStaticParams() {
  return [{ version: urlFormatVersion, year: String(programmeYear) }];
}

export default function ProgrammePage() {
  return <Home />;
}
