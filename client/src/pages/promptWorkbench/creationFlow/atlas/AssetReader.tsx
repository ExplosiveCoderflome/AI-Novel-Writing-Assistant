import { useMemo, useState, type ReactNode } from "react";
import { usePromptCatalog } from "../../hooks/usePromptCatalog";
import { PromptText, type OpenCatalog } from "../PromptText";
import { ReaderFrame, type ReadingControls } from "../ReaderFrame";
import { indexAtlasPrompts, type AtlasPrompt } from "./atlasIndex";

export function RegisteredAssetReader({ id, title, topicTitle, onOpenCatalog, children, ...controls }: ReadingControls & {
  id: string; title: string; topicTitle: string; onOpenCatalog: OpenCatalog; children?: ReactNode;
}) {
  const catalog = usePromptCatalog("");
  const prompt = useMemo(() => indexAtlasPrompts(catalog.prompts).find(item => item.id === id), [id, catalog.prompts]);
  if (prompt) return <AssetReader key={id} prompt={prompt} onOpenCatalog={onOpenCatalog} {...controls}>{children}</AssetReader>;
  return <ReaderFrame title={title} breadcrumb={topicTitle} kind="提示词" {...controls}>
    {children}
    {catalog.query.isPending ? <p className="reader-status" role="status">正在读取提示词版本…</p> :
      <div className="reader-status" role="alert"><p>{catalog.query.isError ? "提示词目录读取失败。" : "目录中没有找到此提示词。"}</p>
        <button type="button" className="reader-copy" onClick={() => void catalog.refetch()}>重新读取目录</button>
      </div>}
  </ReaderFrame>;
}

export function AssetReader({ prompt, onOpenCatalog, children, ...controls }: ReadingControls & { prompt: AtlasPrompt; onOpenCatalog: OpenCatalog; children?: ReactNode }) {
  const [versionKey, setVersionKey] = useState(prompt.versions[0].key);
  const version = prompt.versions.find(v => v.key === versionKey) ?? prompt.versions[0];
  return <ReaderFrame title={prompt.title} breadcrumb={prompt.topicTitle} kind="提示词" {...controls}>
    {children}
    <div className="atlas-asset-reference"><code>{prompt.id}</code>
      {prompt.versions.length > 1 && <label className="atlas-version">阅读版本
      <select value={version.key} onChange={e => setVersionKey(e.target.value)}>{prompt.versions.map(v =>
        <option key={v.key} value={v.key}>{v.version}</option>)}</select>
      </label>}
    </div>
    <PromptText key={version.key} templateKey={version.key} onOpenCatalog={onOpenCatalog} />
  </ReaderFrame>;
}
