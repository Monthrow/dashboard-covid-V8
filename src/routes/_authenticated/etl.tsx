import { createFileRoute } from "@tanstack/react-router";
import { EtlPage } from "@/components/etl/EtlPage";

export const Route = createFileRoute("/_authenticated/etl")({
  head: () => ({
    meta: [
      { title: "ETL Process — COVID-19 Indonesia" },
      { name: "description", content: "Unggah, bersihkan, transformasi, dan muat dataset COVID-19 Indonesia sebagai sumber data dashboard." },
      { property: "og:title", content: "ETL Process — COVID-19 Indonesia" },
      { property: "og:description", content: "Unggah, bersihkan, transformasi, dan muat dataset COVID-19 Indonesia sebagai sumber data dashboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EtlPage,
});
