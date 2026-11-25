import { createFileRoute } from "@tanstack/react-router";
import { MapView } from "@/components/dashboard/MapView";
import { KpiCards } from "@/components/dashboard/widgets";

export const Route = createFileRoute("/_authenticated/dashboard/map")({
  head: () => ({
    meta: [
      { title: "Geographic Distribution — COVID-19 Indonesia" },
      { name: "description", content: "Peta interaktif persebaran COVID-19 per provinsi Indonesia berbasis OpenStreetMap." },
      { property: "og:title", content: "Geographic Distribution — COVID-19 Indonesia" },
      { property: "og:description", content: "Peta interaktif persebaran COVID-19 per provinsi Indonesia berbasis OpenStreetMap." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MapPage,
});

function MapPage() {
  return (
    <>
      <MapView height={600} />
      <KpiCards />
    </>
  );
}
