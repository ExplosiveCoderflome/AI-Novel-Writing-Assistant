import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { BaseCharacter } from "@ai-novel/shared/types/novel";
import AiButton from "@/components/common/AiButton";
import SelectControl from "@/components/common/SelectControl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { CharacterCreateDialogProps } from "./characterPanel.types";

interface CharacterCreateDialogFullProps extends CharacterCreateDialogProps {
  baseCharacters: BaseCharacter[];
  selectedBaseCharacterId: string;
  onSelectedBaseCharacterChange: (id: string) => void;
  selectedBaseCharacter?: BaseCharacter;
  importedBaseCharacterIds: Set<string>;
  onImportBaseCharacter: () => void;
  isImportingBaseCharacter: boolean;
}

export default function CharacterCreateDialog(props: CharacterCreateDialogFullProps) {
  const {
    open,
    onOpenChange,
    quickCharacterForm,
    onQuickCharacterFormChange,
    onQuickCreateCharacter,
    isQuickCreating,
    baseCharacters,
    selectedBaseCharacterId,
    onSelectedBaseCharacterChange,
    selectedBaseCharacter,
    importedBaseCharacterIds,
    onImportBaseCharacter,
    isImportingBaseCharacter,
  } = props;
  const [relationToProtagonist, setRelationToProtagonist] = useState("");
  const [storyFunction, setStoryFunction] = useState("");
  const [wizardKeywords, setWizardKeywords] = useState("");
  const [autoGenerateProfile, setAutoGenerateProfile] = useState(true);
  const previousQuickCreating = useRef(isQuickCreating);

  useEffect(() => {
    if (previousQuickCreating.current && !isQuickCreating && !quickCharacterForm.name.trim()) {
      onOpenChange(false);
      setRelationToProtagonist("");
      setStoryFunction("");
      setWizardKeywords("");
      setAutoGenerateProfile(true);
    }
    previousQuickCreating.current = isQuickCreating;
  }, [isQuickCreating, onOpenChange, quickCharacterForm.name]);

  const handleQuickCreate = () => {
    onQuickCreateCharacter({
      name: quickCharacterForm.name,
      role: quickCharacterForm.role,
      relationToProtagonist,
      storyFunction,
      keywords: wizardKeywords,
      autoGenerateProfile,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.</DialogTitle>
          <DialogDescription>
            Suitable for quickly filling up the lineup. After creation, you can continue to improve the profile, appearance, resources and events in the character asset console.
                                </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
          <div className="space-y-3 rounded-xl border border-border/70 bg-muted/10 p-4">
            <div className="space-y-1">
              <div className="font-medium">Create quickly</div>
              <div className="text-xs text-muted-foreground">
                Create a playable character first, and then let the AI complete the personality, background, and current goals.
                                            </div>
            </div>
            <Input
              placeholder="Role name (required)"
              value={quickCharacterForm.name}
              onChange={(event) => onQuickCharacterFormChange("name", event.target.value)}
            />
            <SelectControl
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={quickCharacterForm.role}
              onChange={(event) => onQuickCharacterFormChange("role", event.target.value)}
            >
              <option value="main character">main character</option>
              <option value="supporting role">supporting role</option>
              <option value="Villain">Villain</option>
              <option value="tutor">tutor</option>
              <option value="emotional line">emotional line</option>
              <option value="functional role">functional role</option>
            </SelectControl>
            <Input
              placeholder="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
              value={relationToProtagonist}
              onChange={(event) => setRelationToProtagonist(event.target.value)}
            />
            <Input
              placeholder="Role in the story (e.g.: advancing the line of truth)"
              value={storyFunction}
              onChange={(event) => setStoryFunction(event.target.value)}
            />
            <Input
              placeholder="Role keywords (comma separated)"
              value={wizardKeywords}
              onChange={(event) => setWizardKeywords(event.target.value)}
            />
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={autoGenerateProfile}
                onChange={(event) => setAutoGenerateProfile(event.target.checked)}
              />
              Automatically complete character, background, growth arc and current status
                                      </label>
            <AiButton onClick={handleQuickCreate} disabled={isQuickCreating || !quickCharacterForm.name.trim()}>
              {isQuickCreating ? "Generating..." : "AI-generated character cards"}
            </AiButton>
          </div>

          <div className="space-y-3 rounded-xl border border-border/70 bg-background p-4">
            <div className="space-y-1">
              <div className="font-medium">Import from basic character library</div>
              <div className="text-xs text-muted-foreground">
                It is suitable for reusing existing templates and then continuing to adjust them according to the needs of the current novel.
                                            </div>
            </div>
            {baseCharacters.length > 0 ? (
              <>
                <SelectControl
                  className="w-full rounded-md border bg-background p-2 text-sm"
                  value={selectedBaseCharacterId}
                  onChange={(event) => onSelectedBaseCharacterChange(event.target.value)}
                >
                  {baseCharacters.map((character) => (
                    <option key={character.id} value={character.id}>
                      {character.name}（{character.role}）
                    </option>
                  ))}
                </SelectControl>
                {selectedBaseCharacter ? (
                  <div className="space-y-2 rounded-xl border bg-muted/20 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{selectedBaseCharacter.name}</span>
                      <Badge variant={importedBaseCharacterIds.has(selectedBaseCharacter.id) ? "outline" : "secondary"}>
                        {importedBaseCharacterIds.has(selectedBaseCharacter.id) ? "Associated" : "Not Associated"}
                      </Badge>
                    </div>
                    <div className="line-clamp-3 text-xs text-muted-foreground">
                      character:{selectedBaseCharacter.personality || "None yet"}
                    </div>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={onImportBaseCharacter}
                    disabled={
                      isImportingBaseCharacter
                      || !selectedBaseCharacter
                      || importedBaseCharacterIds.has(selectedBaseCharacter.id)
                    }
                  >
                    {isImportingBaseCharacter ? "Importing..." : "Importing as a novel character"}
                  </Button>
                  <Button asChild variant="outline">
                    <Link to="/base-characters">Manage basic role library</Link>
                  </Button>
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                The basic character library is empty, please create it first.
                                                </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
