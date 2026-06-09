import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import type { DramaCharacter, DramaProjectDetail } from "@/api/drama";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function CharacterEditor(props: {
  character: DramaCharacter;
  busy: boolean;
  onSave: (character: DramaCharacter, input: { name: string; archetype: string; persona: string; speechStyle: string }) => void;
  onSaveToLibrary: (character: DramaCharacter) => void;
}) {
  const [draft, setDraft] = useState({
    name: props.character.name,
    archetype: props.character.archetype ?? "",
    persona: props.character.persona ?? "",
    speechStyle: props.character.speechStyle ?? "",
  });

  useEffect(() => {
    setDraft({
      name: props.character.name,
      archetype: props.character.archetype ?? "",
      persona: props.character.persona ?? "",
      speechStyle: props.character.speechStyle ?? "",
    });
  }, [props.character.id, props.character.name, props.character.archetype, props.character.persona, props.character.speechStyle]);

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle className="text-base">{props.character.name}</CardTitle>
        <CardDescription>{props.character.archetype || "未设置角色原型"}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">角色名</span>
          <input
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={draft.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">角色原型</span>
          <input
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={draft.archetype}
            onChange={(event) => setDraft((current) => ({ ...current, archetype: event.target.value }))}
          />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">人设</span>
          <textarea
            className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={draft.persona}
            onChange={(event) => setDraft((current) => ({ ...current, persona: event.target.value }))}
          />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">说话风格</span>
          <textarea
            className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={draft.speechStyle}
            onChange={(event) => setDraft((current) => ({ ...current, speechStyle: event.target.value }))}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={props.busy} onClick={() => props.onSave(props.character, draft)}>
            <Save className="h-4 w-4" />
            保存角色
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={props.busy} onClick={() => props.onSaveToLibrary(props.character)}>
            保存到角色库
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function DramaCharactersPanel(props: {
  project: DramaProjectDetail;
  busy: boolean;
  onSave: (character: DramaCharacter, input: { name: string; archetype: string; persona: string; speechStyle: string }) => void;
  onSaveToLibrary: (character: DramaCharacter) => void;
}) {
  const characters = props.project.characters ?? [];
  if (characters.length === 0) {
    return <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">还没有角色资源。整理素材后会自动导入主要角色。</div>;
  }
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {characters.map((character) => (
        <CharacterEditor
          key={character.id}
          character={character}
          busy={props.busy}
          onSave={props.onSave}
          onSaveToLibrary={props.onSaveToLibrary}
        />
      ))}
    </div>
  );
}
