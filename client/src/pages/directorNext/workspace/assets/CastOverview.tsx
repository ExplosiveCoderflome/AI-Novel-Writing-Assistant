import type { Selection, WorkspaceBook } from "../model";
import { ChevronRight } from "lucide-react";
import { SavedFields } from "./sections";

export function CastOverview({book, onSelect}: {book: WorkspaceBook; onSelect?: (selection: Selection) => void}) {
  return <div className="divide-y divide-border/40">
    {book.materials.characters.map(person => <section key={person.id} className="py-5">
      <h3 className="mb-3 text-xl font-semibold">{onSelect
        ? <button type="button" className="inline-flex max-w-full items-center gap-1 rounded-sm text-left hover:underline focus-visible:underline" aria-label={`查看角色档案：${person.name}`} onClick={() => onSelect({kind:"character",id:person.id})}><span className="min-w-0 break-words">{person.name}</span><ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground"/></button>
        : person.name}</h3>
      <SavedFields lead fields={[["故事作用",person.storyFunction],["角色身份",person.role],["行动目标",person.currentGoal],["性格设定",person.personality]]}/>
    </section>)}
    {!book.materials.characters.length ? <p className="py-5 text-sm text-muted-foreground">角色阵容保存后，可查看每个人的身份、动机和成长路线。</p> : null}
  </div>;
}
