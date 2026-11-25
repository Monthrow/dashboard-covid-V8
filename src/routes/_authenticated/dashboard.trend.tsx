import { createFileRoute } from "@tanstack/react-router";
import { KpiCards, TrendChart } from "@/components/dashboard/widgets";

export const Route = createFileRoute("/_authenticated/dashboard/trend")({
  head: () => ({
    meta: [
      { title: "Trend Analysis — COVID-19 Indonesia" },
      { name: "description", content: "Analisis tren harian dan kumulatif kasus, kematian, dan kesembuhan COVID-19 di Indonesia." },
      { property: "og:title", content: "Trend Analysis — COVID-19 Indonesia" },
      { property: "og:description", content: "Analisis tren harian dan kumulatif kasus, kematian, dan kesembuhan COVID-19 di Indonesia." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TrendPage,
});

function TrendPage() {
  return (
    <>
      <KpiCards />
      <TrendChart height={420} />
    </>
  );
}
