import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MobileShelf } from "./MobileShelf";
import { MobileNovel } from "./MobileNovel";
import { MobileRecords, MobileNotifications } from "./MobileRecords";
import { resolveMobileTerminalRoute } from "./routePolicy";

export function MobileTerminal() {
  const location = useLocation();
  const route = resolveMobileTerminalRoute(location.pathname);
  const active = route.kind === "novel" ? "shelf" : route.kind;
  const tabs = [{ kind: "shelf", to: "/novels", label: "小说" }, { kind: "records", to: "/tasks", label: "运行记录" }, { kind: "notifications", to: "/auto-director/follow-ups", label: "通知" }];
  return <div className="min-h-dvh bg-background text-foreground">
    <header className="border-b px-4 py-4"><Link to="/novels" className="font-semibold">小说快捷工作台</Link></header>
    <main className="mobile-site-main mx-auto max-w-xl space-y-5 px-4 py-5 pb-28">
      {route.kind === "shelf" ? <MobileShelf /> : route.kind === "records" ? <MobileRecords /> : route.kind === "notifications" ? <MobileNotifications /> : route.kind === "novel" ? <MobileNovel key={route.novelId} novelId={route.novelId} chapterId={route.chapterId} /> : <section className="space-y-4"><h1 className="text-xl font-semibold">请在电脑端打开此工具</h1><p className="text-sm text-muted-foreground">模型配置、世界与角色规划、大纲编辑、漫画、导出和数据管理请在电脑端完成。手机端可查看小说进度、阅读修改正文和跟进任务。</p><Button asChild><Link to="/novels">查看小说</Link></Button></section>}
    </main>
    <nav aria-label="手机导航" className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t bg-background px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{tabs.map(tab => <Link key={tab.kind} to={tab.to} aria-current={active === tab.kind ? "page" : undefined} className={`rounded-md px-4 py-2 text-sm ${active === tab.kind ? "bg-muted font-semibold text-primary" : "text-muted-foreground"}`}>{tab.label}</Link>)}</nav>
  </div>;
}
