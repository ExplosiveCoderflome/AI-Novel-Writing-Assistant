import type { ReactNode } from "react";
import { BookOpenCheck, Bot, Database, MonitorCog, Palette, Route, SlidersHorizontal } from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

const items = [
  { to: "/settings", label: "设置总览", icon: SlidersHorizontal, end: true },
  { to: "/settings/models", label: "模型与厂商", icon: Bot },
  { to: "/settings/model-routes", label: "模型路由管理", icon: Route },
  { to: "/settings/director", label: "自动导演", icon: BookOpenCheck },
  { to: "/settings/knowledge", label: "知识库与写法", icon: Database },
  { to: "/settings/maintenance", label: "桌面与维护", icon: MonitorCog },
  { to: "/settings/appearance", label: "外观与主题", icon: Palette },
];

export function SettingsShell(props: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="grid gap-6 lg:grid-cols-[176px_minmax(0,1fr)]">
        <nav aria-label="系统设置" className="min-w-0 lg:pt-2">
          <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {items.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => cn(
                  "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </div>
        </nav>
        <main className="min-w-0 space-y-6">
          <header className="space-y-1">
            <h1 className="text-2xl font-semibold text-foreground">{props.title}</h1>
            <p className="text-sm leading-6 text-muted-foreground">{props.description}</p>
          </header>
          {props.children}
        </main>
      </div>
    </div>
  );
}
