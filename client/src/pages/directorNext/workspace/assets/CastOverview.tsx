import type { Selection, WorkspaceBook } from "../model";
import { SavedFields } from "./sections";

export function CastOverview({book, onSelect}: {book: WorkspaceBook; onSelect?: (selection: Selection) => void}) {
  return <div className="divide-y divide-border/40">
    {book.materials.characters.map(person => <section key={person.id} className="py-5">
      <button className="text-lg font-medium hover:text-primary" onClick={() => onSelect?.({kind:"character",id:person.id})}>{person.name}</button>
      <SavedFields fields={[["角色身份",person.role],["性格设定",person.personality],["故事作用",person.storyFunction],["行动目标",person.currentGoal]]}/>
      <button className="mt-3 text-sm text-primary hover:underline" onClick={() => onSelect?.({kind:"character",id:person.id})}>查看角色档案</button>
    </section>)}
    {!book.materials.characters.length ? <p className="py-5 text-sm text-muted-foreground">角色阵容保存后，可查看每个人的身份、动机和成长路线。</p> : null}
  </div>;
}
