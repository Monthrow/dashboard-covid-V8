import { createFileRoute } from "@tanstack/react-router";
import { RegionDrill, TimeDrill } from "@/components/dashboard/DrillDown";

export const Route = createFileRoute("/_authenticated/dashboard/drilldown")({
  head: () => ({
    meta: [
      { title: "Drill-Down Explorer — COVID-19 Indonesia" },
      { name: "description", content: "Telusuri data COVID-19 Indonesia per tahun, bulan, tanggal, dan dari nasional ke pulau, provinsi, dan kota/kabupaten." },
      { property: "og:title", content: "Drill-Down Explorer — COVID-19 Indonesia" },
      { property: "og:description", content: "Telusuri data COVID-19 Indonesia per tahun, bulan, tanggal, dan dari nasional ke pulau, provinsi, dan kota/kabupaten." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DrillPage,
});

function DrillPage() {
  return (
    <>
      <TimeDrill />
      <RegionDrill />
    </>
  );
}
