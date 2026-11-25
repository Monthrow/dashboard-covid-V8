import { createFileRoute } from "@tanstack/react-router";
import { ProvinceBar, TrendChart } from "@/components/dashboard/widgets";

export const Route = createFileRoute("/_authenticated/dashboard/provinces")({
  head: () => ({
    meta: [
      { title: "Provincial Comparison — COVID-19 Indonesia" },
      { name: "description", content: "Perbandingan indikator COVID-19 antarprovinsi di Indonesia dengan filter silang." },
      { property: "og:title", content: "Provincial Comparison — COVID-19 Indonesia" },
      { property: "og:description", content: "Perbandingan indikator COVID-19 antarprovinsi di Indonesia dengan filter silang." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProvincesPage,
});

function ProvincesPage() {
  return (
    <>
      <ProvinceBar defaultTop={34} />
      <TrendChart height={280} />
    </>
  );
}
