import type { StoryMacroField } from "@ai-novel/shared/types/storyMacro";
import AiButton from "@/components/common/AiButton";
import { Button } from "@/components/ui/button";

export const ENGINE_TEXT_FIELDS: Array<{
  field: StoryMacroField;
  label: string;
  placeholder: string;
  multiline?: boolean;
}> = [
  { field: "expanded_premise", label: "Strengthen the premise", placeholder: "First write the strengthened premise of the story so that the sense of oppression and suspense can be established.", multiline: true },
  { field: "protagonist_core", label: "Protagonist's core situation", placeholder: "Write about the situation, cracks, and changeable spaces in which the protagonist is trapped.", multiline: true },
  { field: "conflict_engine", label: "conflict engine", placeholder: "Write out why the story continues to escalate, rather than just writing about one conflict.", multiline: true },
  { field: "mystery_box", label: "Core unknown", placeholder: "Write about the questions that readers most want to know but don’t have answers for now.", multiline: true },
  { field: "emotional_line", label: "Emotional push", placeholder: "Write about how emotions deepen gradually, rather than simply becoming stronger.", multiline: true },
  { field: "tone_reference", label: "narrative temperament", placeholder: "Writing style, narrative posture, control method.", multiline: true },
];

export const SUMMARY_FIELDS: Array<{
  field: StoryMacroField;
  label: string;
  placeholder: string;
  multiline?: boolean;
}> = [
  { field: "selling_point", label: "Selling point in one sentence", placeholder: "In one sentence, explain what is most attractive to readers about this work." },
  { field: "core_conflict", label: "long-term antagonism", placeholder: "Write about long-term irreconcilable opposition." },
  { field: "main_hook", label: "main line hook", placeholder: "Write an unknown main line question." },
  { field: "progression_loop", label: "Propulsion circuit", placeholder: "Write down how to discover -> upgrade -> reverse the cycle.", multiline: true },
  { field: "growth_path", label: "growth path", placeholder: "Write about how the protagonist’s cognition changes in stages.", multiline: true },
  { field: "ending_flavor", label: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.", placeholder: "For example, collapse, blankness, reversal, calmness and depression." },
];

export function listToText(value: string[]): string {
  return value.join("\n");
}

export function textareaClassName(minHeight = "min-h-28") {
  return `${minHeight} w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring`;
}

export function FieldActions(props: {
  field: StoryMacroField;
  lockedFields: Partial<Record<StoryMacroField, boolean>>;
  regeneratingField: StoryMacroField | "";
  storyInput: string;
  onToggleLock: (field: StoryMacroField) => void;
  onRegenerateField: (field: StoryMacroField) => void;
}) {
  const isLocked = Boolean(props.lockedFields[props.field]);
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant={isLocked ? "secondary" : "outline"}
        onClick={() => props.onToggleLock(props.field)}
      >
        {isLocked ? "Locked" : "Locked"}
      </Button>
      <AiButton
        size="sm"
        variant="outline"
        onClick={() => props.onRegenerateField(props.field)}
        disabled={props.regeneratingField === props.field || isLocked || !props.storyInput.trim()}
      >
        {props.regeneratingField === props.field ? "Regenerating..." : "Regenerating"}
      </AiButton>
    </div>
  );
}
