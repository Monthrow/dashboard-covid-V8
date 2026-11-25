import { createFileRoute } from "@tanstack/react-router";
import { ExecutiveSummary, KpiCards, ProvinceBar, TrendChart } from "@/components/dashboard/widgets";
import { MapView } from "@/components/dashboard/MapView";

export const Route = createFileRoute("/_authenticated/dashboard/")({
  head: () => ({
    meta: [
      { title: "COVID-19 Indonesia Analytics Dashboard — Overview" },
      { name: "description", content: "Dashboard eksekutif interaktif COVID-19 Indonesia: KPI, tren, perbandingan provinsi, peta, dan ringkasan." },
      { property: "og:title", content: "COVID-19 Indonesia Analytics Dashboard — Overview" },
      { property: "og:description", content: "Dashboard eksekutif interaktif COVID-19 Indonesia: KPI, tren, perbandingan provinsi, peta, dan ringkasan." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Overview,
});

function Overview() {
  return (
    <>
      <KpiCards />
      <TrendChart height={300} />
      <div className="grid gap-5 xl:grid-cols-2">
        <ProvinceBar />
        <MapView height={420} />
      </div>
      <ExecutiveSummary />
    </>
  );
}
