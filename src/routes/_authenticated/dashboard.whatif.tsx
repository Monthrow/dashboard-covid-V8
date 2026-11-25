import { createFileRoute } from "@tanstack/react-router";
import { WhatIf } from "@/components/dashboard/WhatIf";
import { ExecutiveSummary } from "@/components/dashboard/widgets";

export const Route = createFileRoute("/_authenticated/dashboard/whatif")({
  head: () => ({
    meta: [
      { title: "What-If Scenario Analysis — COVID-19 Indonesia" },
      { name: "description", content: "Simulasi skenario perubahan kasus, kematian, dan kesembuhan COVID-19 berbasis data historis." },
      { property: "og:title", content: "What-If Scenario Analysis — COVID-19 Indonesia" },
      { property: "og:description", content: "Simulasi skenario perubahan kasus, kematian, dan kesembuhan COVID-19 berbasis data historis." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WhatIfPage,
});

function WhatIfPage() {
  return (
    <>
      <WhatIf />
      <ExecutiveSummary />
    </>
  );
}
