import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getAdminStatus } from "@/lib/admin.functions";

// Every page under this layout is admin-only. The server checks the encrypted
// login cookie; data is read in the browser from the local PHP/MySQL API, so the page
// renders client-side (ssr: false).
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { admin } = await getAdminStatus();
    if (!admin) throw redirect({ to: "/auth" });
  },
  component: () => <Outlet />,
});
