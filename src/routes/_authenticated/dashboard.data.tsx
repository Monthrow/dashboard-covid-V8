import { createFileRoute } from "@tanstack/react-router";
import { DataInfo } from "@/components/dashboard/DataInfo";

export const Route = createFileRoute("/_authenticated/dashboard/data")({
  head: () => ({
    meta: [
      { title: "Data Information — COVID-19 Indonesia" },
      { name: "description", content: "Informasi dataset, metode agregasi, keterbatasan, dan tabel data COVID-19 Indonesia yang dapat diekspor." },
      { property: "og:title", content: "Data Information — COVID-19 Indonesia" },
      { property: "og:description", content: "Informasi dataset, metode agregasi, keterbatasan, dan tabel data COVID-19 Indonesia yang dapat diekspor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DataPage,
});

function DataPage() {
  return (
    <DataInfo />
  );
}
