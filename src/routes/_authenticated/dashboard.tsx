import { createFileRoute, Outlet } from "@tanstack/react-router";
import { DataProvider } from "@/components/dashboard/DataContext";
import { Shell } from "@/components/dashboard/Shell";

// Shared dataset + filters for every dashboard page; reloads the latest ETL dataset on entry.
export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardLayout,
});

function DashboardLayout() {
  return (
    <DataProvider>
      <Shell><Outlet /></Shell>
    </DataProvider>
  );
}
