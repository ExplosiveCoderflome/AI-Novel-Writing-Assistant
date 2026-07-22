import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { useEffect, useMemo, useState } from "react";
import type { BaseCharacter } from "@ai-novel/shared/types/novel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type EditableBaseCharacter = Omit<BaseCharacter, "id" | "createdAt" | "updatedAt">;

interface CharacterEditDialogProps {
  open: boolean;
  character: BaseCharacter | null;
  saving?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: EditableBaseCharacter) => void;
}

function createEmptyForm(): EditableBaseCharacter {
  return {
    name: "",
    role: "",
    personality: "",
    background: "",
    development: "",
    appearance: "",
    weaknesses: "",
    interests: "",
    keyEvents: "",
    tags: "",
    category: "",
  };
}

function createFormFromCharacter(character: BaseCharacter): EditableBaseCharacter {
  return {
    name: character.name,
    role: character.role,
    personality: character.personality,
    background: character.background,
    development: character.development,
    appearance: character.appearance ?? "",
    weaknesses: character.weaknesses ?? "",
    interests: character.interests ?? "",
    keyEvents: character.keyEvents ?? "",
    tags: character.tags,
    category: character.category,
  };
}

function trimFormValue(value: string) {
  return value.trim();
}

export function CharacterEditDialog({
  open,
  character,
  saving,
  onOpenChange,
  onSubmit,
}: CharacterEditDialogProps) {
  const [form, setForm] = useState<EditableBaseCharacter>(createEmptyForm());

  useEffect(() => {
    if (!open || !character) {
      return;
    }
    setForm(createFormFromCharacter(character));
  }, [open, character]);

  const hasRequiredFields = useMemo(
    () => [form.name, form.role, form.personality, form.background, form.development, form.category]
      .every((value) => trimFormValue(value).length > 0),
    [form],
  );

  const handleSubmit = () => {
    if (!hasRequiredFields) {
      return;
    }
    onSubmit({
      ...form,
      name: trimFormValue(form.name),
      role: trimFormValue(form.role),
      personality: trimFormValue(form.personality),
      background: trimFormValue(form.background),
      development: trimFormValue(form.development),
      category: trimFormValue(form.category),
      appearance: form.appearance,
      weaknesses: form.weaknesses,
      interests: form.interests,
      keyEvents: form.keyEvents,
      tags: form.tags,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-h-[90vh] max-w-[1100px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{character ? `编辑角色：${character.name}` : t("gen.pages.characters.components.CharacterEditDialog.gen_ac775e9a")}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-2 md:grid-cols-2">
          <Input
            placeholder={t("gen.pages.characters.components.CharacterEditDialog.gen_10a6f121")}
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          />
          <Input
            placeholder={t("gen.pages.characters.components.CharacterEditDialog.gen_22cffcec")}
            value={form.role}
            onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))}
          />
          <Input
            placeholder={t("gen.pages.characters.components.CharacterEditDialog.gen_b5921bc1")}
            value={form.category}
            onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
          />
          <Input
            placeholder={t("gen.pages.characters.components.CharacterEditDialog.gen_04c16cd4")}
            value={form.tags}
            onChange={(event) => setForm((prev) => ({ ...prev, tags: event.target.value }))}
          />
        </div>

        <div className="space-y-2">
          <textarea
            className="min-h-[90px] w-full rounded-md border bg-background p-2 text-sm"
            placeholder={t("gen.pages.characters.components.CharacterEditDialog.gen_689150c2")}
            value={form.personality}
            onChange={(event) => setForm((prev) => ({ ...prev, personality: event.target.value }))}
          />
          <textarea
            className="min-h-[90px] w-full rounded-md border bg-background p-2 text-sm"
            placeholder={t("gen.pages.characters.components.CharacterEditDialog.gen_78c847e0")}
            value={form.background}
            onChange={(event) => setForm((prev) => ({ ...prev, background: event.target.value }))}
          />
          <textarea
            className="min-h-[90px] w-full rounded-md border bg-background p-2 text-sm"
            placeholder={t("gen.pages.characters.components.CharacterEditDialog.gen_4578b906")}
            value={form.development}
            onChange={(event) => setForm((prev) => ({ ...prev, development: event.target.value }))}
          />
          <textarea
            className="min-h-[80px] w-full rounded-md border bg-background p-2 text-sm"
            placeholder={t("gen.pages.characters.components.CharacterEditDialog.gen_0ba83898")}
            value={form.appearance ?? ""}
            onChange={(event) => setForm((prev) => ({ ...prev, appearance: event.target.value }))}
          />
          <textarea
            className="min-h-[80px] w-full rounded-md border bg-background p-2 text-sm"
            placeholder={t("gen.pages.characters.components.CharacterEditDialog.gen_b2833ce5")}
            value={form.weaknesses ?? ""}
            onChange={(event) => setForm((prev) => ({ ...prev, weaknesses: event.target.value }))}
          />
          <textarea
            className="min-h-[80px] w-full rounded-md border bg-background p-2 text-sm"
            placeholder={t("gen.pages.characters.components.CharacterEditDialog.habitsAndSkills")}
            value={form.interests ?? ""}
            onChange={(event) => setForm((prev) => ({ ...prev, interests: event.target.value }))}
          />
          <textarea
            className="min-h-[80px] w-full rounded-md border bg-background p-2 text-sm"
            placeholder={t("gen.pages.characters.components.CharacterEditDialog.gen_cbf6f4f8")}
            value={form.keyEvents ?? ""}
            onChange={(event) => setForm((prev) => ({ ...prev, keyEvents: event.target.value }))}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !hasRequiredFields || !character}>
            {saving ? t("gen.pages.characters.components.CharacterEditDialog.savingInProgressDotDotDot") : t("gen.pages.characters.components.CharacterEditDialog.saveChanges")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
