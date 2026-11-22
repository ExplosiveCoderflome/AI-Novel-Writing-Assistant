import type {ReactNode} from "react";

export function SavedFields({fields, lead = false, empty = "这一部分尚未保存详细设定。"}: {fields: [string, string | null | undefined, ReactNode?][]; lead?: boolean; empty?: string}) {
  const saved = fields.filter(([,value]) => value?.trim());
  if (!saved.length) return <p className="text-sm leading-7 text-muted-foreground">{empty}</p>;
  return <dl className="grid grid-cols-1 gap-x-8 gap-y-5 [@container_(min-width:56rem)]:grid-cols-2">
    {saved.map(([label,value,formattedValue], index) => {
      const primary = lead && index === 0;
      return <div key={label} className={primary ? "col-span-full min-w-0" : "min-w-0"}>
        <dt className="text-sm font-semibold">{label}</dt>
        <dd className={`mt-1 max-w-[46em] whitespace-pre-wrap break-words ${primary ? "text-lg leading-8" : "text-sm leading-7 text-foreground/80"}`}>{formattedValue ?? value}</dd>
      </div>;
    })}
  </dl>;
}

export function SavedList({label, items}: {label: string; items?: string[]}) {
  const saved = items?.filter(item => item?.trim()) ?? [];
  if (!saved.length) return null;
  return <div className="space-y-2"><h4 className="text-xs font-medium text-muted-foreground">{label}</h4>
    <ul className="list-disc space-y-2 pl-5 text-sm leading-7">{saved.map((item,index) => <li key={index}>{item}</li>)}</ul>
  </div>;
}

export function AssetSection({title, count, open = false, children}: {title: string; count?: number; open?: boolean; children: ReactNode}) {
  return <details open={open} className="py-4"><summary className="cursor-pointer rounded-sm text-base font-semibold focus-visible:outline-ring">
    {title}{count !== undefined ? <span className="ml-2 text-xs font-normal text-muted-foreground">{count} 项</span> : null}
  </summary><div className="mt-5 space-y-5">{children}</div></details>;
}

export function NamedAsset({name, children}: {name: string; children: ReactNode}) {
  return <div className="space-y-3 border-l-2 border-border/40 pl-4"><h4 className="font-semibold">{name}</h4>{children}</div>;
}
