import { useQuery } from "@tanstack/react-query";
import { NavLink } from "react-router-dom";
import { listKnowledgeDocuments } from "@/api/knowledge";
import { queryKeys } from "@/api/queryKeys";
import { listTasks } from "@/api/tasks";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const navGroups = [
  {
    title: "创作",
    items: [
      { to: "/", label: "首页" },
      { to: "/novels", label: "小说列表" },
      { to: "/creative-hub", label: "创作中枢" },
      { to: "/book-analysis", label: "拆书" },
      { to: "/tasks", label: "任务中心" },
    ],
  },
  {
    title: "资产",
    items: [
      { to: "/genres", label: "类型管理" },
      { to: "/titles", label: "标题工坊" },
      { to: "/knowledge", label: "知识库" },
      { to: "/worlds", label: "世界观" },
      { to: "/style-engine", label: "写法引擎" },
      { to: "/base-characters", label: "基础角色库" },
    ],
  },
  {
    title: "系统",
    items: [
      { to: "/settings/model-routes", label: "模型路由" },
      { to: "/settings", label: "系统设置" },
    ],
  },
] as const;

export default function Sidebar() {
  const taskQuery = useQuery({
    queryKey: queryKeys.tasks.list("sidebar"),
    queryFn: () => listTasks({ limit: 80 }),
    refetchInterval: (query) => {
      const rows = query.state.data?.data?.items ?? [];
      return rows.some((item) => item.status === "queued" || item.status === "running") ? 4000 : false;
    },
  });

  const knowledgeQuery = useQuery({
    queryKey: queryKeys.knowledge.documents("sidebar"),
    queryFn: () => listKnowledgeDocuments(),
    staleTime: 30_000,
  });

  const tasks = taskQuery.data?.data?.items ?? [];
  const runningTaskCount = tasks.filter((item) => item.status === "running").length;
  const failedTaskCount = tasks.filter((item) => item.status === "failed").length;
  const knowledgeDocuments = knowledgeQuery.data?.data ?? [];
  const failedIndexCount = knowledgeDocuments.filter((item) => item.latestIndexStatus === "failed").length;

  const renderBadge = (to: string) => {
    if (to === "/tasks") {
      if (runningTaskCount <= 0 && failedTaskCount <= 0) {
        return null;
      }
      return (
        <div className="ml-auto flex items-center gap-1">
          {runningTaskCount > 0 ? (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              R{runningTaskCount}
            </Badge>
          ) : null}
          {failedTaskCount > 0 ? (
            <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
              F{failedTaskCount}
            </Badge>
          ) : null}
        </div>
      );
    }
    if (to === "/knowledge" && failedIndexCount > 0) {
      return (
        <Badge variant="destructive" className="ml-auto h-5 px-1.5 text-[10px]">
          F{failedIndexCount}
        </Badge>
      );
    }
    return null;
  };

  return (
    <aside className="w-64 border-r bg-muted/20 p-4">
      <nav className="space-y-4">
        {navGroups.map((group) => (
          <div key={group.title} className="space-y-1">
            <div className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">
              {group.title}
            </div>
            {group.items.map((item) => (
              <NavLink key={item.to} to={item.to}>
                {({ isActive }) => (
                  <div
                    className={cn(
                      "relative flex items-center rounded-md py-2 pl-4 pr-2 text-sm transition-colors",
                      isActive
                        ? "bg-accent/90 font-semibold text-accent-foreground"
                        : "text-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute left-1 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-transparent",
                        isActive && "bg-primary",
                      )}
                    />
                    <span>{item.label}</span>
                    {renderBadge(item.to)}
                  </div>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
