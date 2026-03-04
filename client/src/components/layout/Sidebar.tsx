import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "首页" },
  { to: "/novels", label: "小说列表" },
  { to: "/chat", label: "AI 对话" },
  { to: "/worlds", label: "世界观" },
  { to: "/writing-formula", label: "写作公式" },
  { to: "/base-characters", label: "基础角色库" },
  { to: "/settings", label: "系统设置" },
];

export default function Sidebar() {
  return (
    <aside className="w-64 border-r bg-muted/20 p-4">
      <nav className="space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "block rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                isActive && "bg-accent text-accent-foreground",
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
