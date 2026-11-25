import { Activity } from "lucide-react";

export function AppLogo({ subtitle = "Indonesia Analytics", size = "md" }: { subtitle?: string; size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-12 w-12" : "h-10 w-10";
  return (
    <div className="flex items-center gap-3">
      <div className={`grid ${box} place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm`}>
        <Activity className={size === "lg" ? "h-7 w-7" : "h-5 w-5"} />
      </div>
      <div className="leading-tight">
        <div className={`font-extrabold tracking-tight text-foreground ${size === "lg" ? "text-xl" : "text-base"}`}>COVID-19 Indonesia</div>
        <div className="text-xs text-muted-foreground">{subtitle}</div>
      </div>
    </div>
  );
}
