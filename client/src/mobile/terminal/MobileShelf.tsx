import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getNovelList } from "@/api/novel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function MobileShelf() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const query = useQuery({ queryKey: ["mobileShelf", page, search], queryFn: () => getNovelList({ page, limit: 20, search }), refetchInterval: 10000 });
  const data = query.data?.data;
  return <section className="space-y-4">
    <h1 className="text-xl font-semibold">我的小说</h1>
    <p className="text-sm text-muted-foreground">查看进度、阅读章节，或继续本书任务。开书与资料规划请在电脑端完成。</p>
    <Input aria-label="搜索小说" placeholder="搜索小说" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} />
    {query.isError ? <p role="alert">小说读取失败。<Button variant="ghost" onClick={() => void query.refetch()}>重新读取</Button></p> : null}
    {query.isPending ? <p role="status">正在读取小说…</p> : null}
    <div className="divide-y">{data?.items.map(novel => <Link className="block space-y-2 py-4" key={novel.id} to={`/novels/${encodeURIComponent(novel.id)}/edit`}>
      <h2 className="font-medium">{novel.title}</h2>
      <p className="text-sm text-muted-foreground">已写 {novel.bookProgress?.writtenChapters ?? 0} / {novel.bookProgress?.targetChapters ?? novel.estimatedChapterCount ?? novel._count.chapters} 章 · 已规划 {novel._count.chapters} 章</p>
      {novel.latestAutoDirectorTask?.currentItemLabel ? <p className="text-sm">{novel.latestAutoDirectorTask.currentItemLabel}</p> : null}
    </Link>)}</div>
    {data && data.total === 0 ? <p className="py-6 text-sm text-muted-foreground">暂无小说，请在电脑端创建后从这里跟进。</p> : null}
    {data && data.totalPages > 1 ? <div className="flex items-center justify-between"><Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>上一页</Button><span className="text-sm">{page} / {data.totalPages}</span><Button variant="outline" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>下一页</Button></div> : null}
  </section>;
}
