import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DIRECTOR_CREATE_LINK,
  MANUAL_CREATE_LINK,
} from "./novelListViewModel";

export function NovelListEmptyState(props: {
  hasAnyNovel: boolean;
}) {
  return (
    <section className="py-12 text-center">
      <h2 className="text-xl font-semibold tracking-normal">
        {props.hasAnyNovel ? "没有符合筛选条件的小说" : "还没有小说项目"}
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
        {props.hasAnyNovel
          ? "可以切换上方筛选条件，或者创建一个新的小说项目。"
          : "第一次使用时，推荐让 AI 自动导演先整理方向、角色、世界观和章节准备。"}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link to={DIRECTOR_CREATE_LINK}>AI 自动导演开书</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to={MANUAL_CREATE_LINK}>手动创建小说</Link>
        </Button>
      </div>
    </section>
  );
}
