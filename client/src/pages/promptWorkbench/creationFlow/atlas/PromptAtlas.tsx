import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, LibraryBig, Search } from "lucide-react";
import { usePromptCatalog } from "../../hooks/usePromptCatalog";
import type { OpenCatalog } from "../PromptText";
import { AssetReader } from "./AssetReader";
import { AtlasCanvas } from "./AtlasCanvas";
import { indexAtlasPrompts, type AtlasPrompt } from "./atlasIndex";
import { atlasScopes, type AtlasLocation } from "./atlasTopics";
import "./promptAtlas.css";

function AtlasSearch({ prompts, select }: { prompts: AtlasPrompt[]; select: (prompt: AtlasPrompt) => void }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const query = text.trim().toLowerCase();
  const matches = useMemo(() => query ? prompts.filter(p =>
    [p.title, p.topicTitle, p.id, p.versions[0].shortDescription].some(value => value.toLowerCase().includes(query))) : [], [prompts, query]);
  const show = open && !!query;
  return <div className="atlas-search" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}
    onKeyDown={e => { if (e.key === "Escape") { search.current?.focus(); setOpen(false); } }}>
    <Search size={15} /><input ref={search} type="search" value={text} placeholder="搜索名称或提示词 ID" aria-label="在所有分图中搜索提示词"
      onFocus={() => setOpen(true)} onChange={e => { setText(e.target.value); setOpen(true); }}
      onKeyDown={e => {
        if (e.key === "ArrowDown" && show && matches.length) {
          e.preventDefault(); e.currentTarget.parentElement?.querySelector<HTMLButtonElement>(".atlas-results button")?.focus();
        }
        if (e.key === "Enter" && query && matches[0]) { select(matches[0]); setText(""); setOpen(false); }
      }} />
    {show && <div className="atlas-results" aria-label="匹配的提示词">
      {matches.length ? matches.map(p => <button key={p.id} type="button" onClick={() => { select(p); setText(""); setOpen(false); }}>
        <span>{p.title}<small>{p.topicTitle}</small></span><ArrowUpRight size={14} />
      </button>) : <p role="status">未找到匹配的提示词。</p>}
    </div>}
  </div>;
}

export function PromptAtlas({ initial, back, onOpenCatalog }: { initial: AtlasLocation; back: () => void; onOpenCatalog: OpenCatalog }) {
  const [where, setWhere] = useState(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const root = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const catalog = usePromptCatalog("");
  const prompts = useMemo(() => indexAtlasPrompts(catalog.prompts), [catalog.prompts]);
  const scope = atlasScopes.find(item => item.id === where.scope) ?? atlasScopes[0];
  const topic = scope.topics.find(item => item.id === where.topic) ?? scope.topics[0];
  const visible = useMemo(() => prompts.filter(p => p.topic === topic.id), [prompts, topic]);
  const entry = visible.find(p => p.id === selected);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  const select = useCallback((prompt: AtlasPrompt) => {
    setWhere({ scope: prompt.scope, topic: prompt.topic }); setSelected(prompt.id);
  }, []);
  function navigate(location: AtlasLocation) { setWhere(location); setSelected(null); setFocused(false); }
  function close() {
    setSelected(null); setFocused(false);
    requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>(`[data-prompt-id="${selected}"]`)?.focus({ preventScroll: true }));
  }
  return <section className="book-atlas prompt-atlas" data-stage={scope.skin} aria-label="创作提示词分图" ref={root}>
    <nav className="atlas-scope-nav" aria-label="提示词分图范围">
      <button type="button" className="atlas-back" onClick={back}><ArrowLeft size={15} />返回流程图</button>
      <div>{atlasScopes.map(item => <button type="button" key={item.id} data-stage={item.skin} aria-current={item === scope ? "page" : undefined}
        onClick={() => navigate({ scope: item.id })}>{item.id === "tools" && <LibraryBig size={13} />}{item.title}</button>)}</div>
    </nav>
    <header className="atlas-index-heading">
      <div><h2 tabIndex={-1} ref={heading}>{scope.title}<span>提示词分图</span></h2><p>{topic.description}</p></div>
      <div className="atlas-index-actions">
        <label>主题<select value={topic.id} onChange={e => navigate({ scope: scope.id, topic: e.target.value })}>
          {scope.topics.map(t => <option value={t.id} key={t.id}>{t.title}</option>)}</select></label>
        <AtlasSearch prompts={prompts} select={select} />
      </div>
    </header>
    <div className={`book-atlas-spread ${entry ? "reading" : ""} ${focused ? "focused" : ""}`}>
      <div className="book-map-pane">
        {catalog.query.isError ? <div className="atlas-index-status" role="alert">提示词目录读取失败。<button type="button" onClick={() => void catalog.refetch()}>重新读取</button></div>
          : catalog.query.isPending ? <p className="atlas-index-status" role="status">正在读取提示词目录…</p>
          : visible.length ? <AtlasCanvas stage={scope.id} topic={topic} prompts={visible} selected={selected} select={select} />
          : <p className="atlas-index-status" role="status">此主题暂无可读的提示词。</p>}
        <footer className="book-map-key"><span><i />同一用途下的提示词</span><small>点选提示词可阅读或复制全文</small></footer>
      </div>
      {entry && <div className="book-map-reader"><AssetReader key={entry.id} prompt={entry} focused={focused}
        backToMap={close} toggleFocus={() => setFocused(v => !v)} onOpenCatalog={onOpenCatalog} /></div>}
    </div>
  </section>;
}
