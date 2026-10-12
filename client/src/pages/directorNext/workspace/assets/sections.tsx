import type {ReactNode} from "react";

export function SavedFields({fields, empty = "这一部分尚未保存详细设定。"}: {fields: [string, string | null | undefined][]; empty?: string}) {
  const saved = fields.filter(([,value]) => value?.trim());
  return saved.length ? <dl className="space-y-4">{saved.map(([label,value]) => <div key={label}>
    <dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 whitespace-pre-wrap text-base leading-8">{value}</dd>
  </div>)}</dl> : <p className="text-sm leading-7 text-muted-foreground">{empty}</p>;
}

export function SavedList({label, items}: {label: string; items?: string[]}) {
  const saved = items?.filter(item => item?.trim()) ?? [];
  if (!saved.length) return null;
  return <div className="space-y-2"><h4 className="text-xs font-medium text-muted-foreground">{label}</h4>
    <ul className="list-disc space-y-2 pl-5 text-sm leading-7">{saved.map((item,index) => <li key={index}>{item}</li>)}</ul>
  </div>;
}

export function AssetSection({title, count, open = false, children}: {title: string; count?: number; open?: boolean; children: ReactNode}) {
  return <details open={open} className="py-5"><summary className="cursor-pointer text-base font-medium">
    {title}{count !== undefined ? <span className="ml-2 text-xs font-normal text-muted-foreground">{count} 项</span> : null}
  </summary><div className="mt-5 space-y-5">{children}</div></details>;
}

export function NamedAsset({name, children}: {name: string; children: ReactNode}) {
  return <div className="space-y-3 border-l-2 border-border/40 pl-4"><h4 className="font-semibold">{name}</h4>{children}</div>;
}
