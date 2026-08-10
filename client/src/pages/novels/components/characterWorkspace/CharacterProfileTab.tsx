import i18next from "i18next";
import AiButton from "@/components/common/AiButton";
import SelectControl from "@/components/common/SelectControl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VISIBLE_PROFILE_FIELDS } from "./characterWorkspace.helpers";
import type { EditableCharacterFormProps } from "./characterWorkspace.types";

interface CharacterProfileTabProps extends EditableCharacterFormProps {
  onSyncTimeline: () => void;
  isSyncingTimeline: boolean;
  onSyncAllTimeline: () => void;
  isSyncingAllTimeline: boolean;
  onWorldCheck: () => void;
  isCheckingWorld: boolean;
}

export default function CharacterProfileTab(props: CharacterProfileTabProps) {
  const {
    characterForm,
    onCharacterFormChange,
    onSaveCharacter,
    isSavingCharacter,
    onSyncTimeline,
    isSyncingTimeline,
    onSyncAllTimeline,
    isSyncingAllTimeline,
    onWorldCheck,
    isCheckingWorld,
  } = props;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border/70 bg-muted/10 p-4">
        <div className="mb-3">
          <div className="text-sm font-medium">{i18next.t("novels.characterProfileTab.bll93f")}</div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">{i18next.t("novels.characterProfileTab.7ldxsq")}</div>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <Input
            placeholder={i18next.t("dict.gen_10a6f121")}
            value={characterForm.name}
            onChange={(event) => onCharacterFormChange("name", event.target.value)}
          />
          <Input
            placeholder={i18next.t("dict.gen_22cffcec")}
            value={characterForm.role}
            onChange={(event) => onCharacterFormChange("role", event.target.value)}
          />
          <SelectControl
            className="w-full rounded-md border bg-background p-2 text-sm"
            value={characterForm.gender}
            onChange={(event) => onCharacterFormChange("gender", event.target.value)}
          >
            <option value="unknown">{i18next.t("dict.gen_bf22e442")}</option>
            <option value="male">{i18next.t("dict.gen_940ec4fe")}</option>
            <option value="female">{i18next.t("dict.gen_6e2fb7fd")}</option>
            <option value="other">{i18next.t("dict.gen_3a5b7ca6")}</option>
          </SelectControl>
        </div>
      </section>

      <section className="rounded-xl border border-border/70 bg-background p-4">
        <div className="mb-3 text-sm font-medium">{i18next.t("novels.characterProfileTab.cdbie1")}</div>
        <div className="grid gap-2 md:grid-cols-2">
          <Input
            placeholder={i18next.t("dict.gen_ca7f49bf")}
            value={characterForm.currentState}
            onChange={(event) => onCharacterFormChange("currentState", event.target.value)}
          />
          <Input
            placeholder={i18next.t("dict.gen_bad43983")}
            value={characterForm.currentGoal}
            onChange={(event) => onCharacterFormChange("currentGoal", event.target.value)}
          />
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-3">
        <TextAreaField
          label={i18next.t("dict.gen_e3bb2ab7")}
          value={characterForm.personality}
          onChange={(value) => onCharacterFormChange("personality", value)}
        />
        <TextAreaField
          label={i18next.t("dict.gen_06575dab")}
          value={characterForm.background}
          onChange={(value) => onCharacterFormChange("background", value)}
        />
        <TextAreaField
          label={i18next.t("dict.gen_6f6c3755")}
          value={characterForm.development}
          onChange={(value) => onCharacterFormChange("development", value)}
        />
      </section>

      <section className="rounded-xl border border-border/70 bg-background p-4">
        <div className="mb-3 text-sm font-medium">{i18next.t("novels.characterProfileTab.jbrh1n")}</div>
        <div className="grid gap-2 md:grid-cols-2">
          {VISIBLE_PROFILE_FIELDS.map((field) => (
            <textarea
              key={field.key}
              className="min-h-[72px] w-full rounded-md border bg-background p-2 text-sm"
              placeholder={`${field.label}：${field.placeholder}`}
              value={characterForm[field.key]}
              onChange={(event) => onCharacterFormChange(field.key, event.target.value)}
            />
          ))}
        </div>
      </section>

      <div className="flex flex-wrap gap-2 rounded-xl border border-border/70 bg-muted/10 p-3">
        <Button size="sm" onClick={onSaveCharacter} disabled={isSavingCharacter}>
          {isSavingCharacter ? "保存中..." : "保存角色资产"}
        </Button>
        <AiButton size="sm" variant="outline" onClick={onSyncTimeline} disabled={isSyncingTimeline}>
          {isSyncingTimeline ? "同步中..." : "同步角色时间线"}
        </AiButton>
        <AiButton size="sm" variant="outline" onClick={onSyncAllTimeline} disabled={isSyncingAllTimeline}>
          {isSyncingAllTimeline ? "同步中..." : "同步全部角色时间线"}
        </AiButton>
        <AiButton size="sm" variant="outline" onClick={onWorldCheck} disabled={isCheckingWorld}>
          {isCheckingWorld ? "检查中..." : "检查世界一致性"}
        </AiButton>
      </div>
    </div>
  );
}

function TextAreaField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block rounded-xl border border-border/70 bg-background p-3">
      <span className="text-sm font-medium">{props.label}</span>
      <textarea
        className="mt-2 min-h-[116px] w-full rounded-md border bg-background p-2 text-sm"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  );
}
