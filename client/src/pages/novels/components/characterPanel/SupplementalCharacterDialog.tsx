import { useState } from "react";
import type {
  Character,
  CharacterCastRole,
  SupplementalCharacterCandidate,
  SupplementalCharacterGenerationMode,
  SupplementalCharacterGenerationResult,
} from "@ai-novel/shared/types/novel";
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
import {
  getCastRoleLabel,
  getCharacterGenderLabel,
  getSupplementalRelationLabel,
  SUPPLEMENTAL_MODE_LABELS,
} from "./characterPanel.labels";
import type { SupplementalCharacterDialogActions } from "./characterPanel.types";

interface SupplementalCharacterDialogProps extends SupplementalCharacterDialogActions {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  characters: Character[];
  selectedCharacterId: string;
  isGeneratingSupplementalCharacters: boolean;
  isApplyingSupplementalCharacter: boolean;
}

export default function SupplementalCharacterDialog(props: SupplementalCharacterDialogProps) {
  const {
    open,
    onOpenChange,
    characters,
    selectedCharacterId,
    onGenerateSupplementalCharacters,
    isGeneratingSupplementalCharacters,
    onApplySupplementalCharacter,
    isApplyingSupplementalCharacter,
  } = props;
  const [supplementalMode, setSupplementalMode] = useState<SupplementalCharacterGenerationMode>("auto");
  const [supplementalAnchorIds, setSupplementalAnchorIds] = useState<string[]>([]);
  const [supplementalTargetRole, setSupplementalTargetRole] = useState<CharacterCastRole | "auto">("auto");
  const [supplementalCount, setSupplementalCount] = useState<"auto" | "1" | "2" | "3">("auto");
  const [supplementalPrompt, setSupplementalPrompt] = useState("");
  const [supplementalUseWorldContext, setSupplementalUseWorldContext] = useState(true);
  const [supplementalStatusMessage, setSupplementalStatusMessage] = useState("");
  const [supplementalResult, setSupplementalResult] = useState<SupplementalCharacterGenerationResult | null>(null);

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (nextOpen && selectedCharacterId && supplementalAnchorIds.length === 0) {
      setSupplementalAnchorIds([selectedCharacterId]);
    }
  };

  const toggleSupplementalAnchor = (characterId: string) => {
    setSupplementalAnchorIds((prev) =>
      prev.includes(characterId)
        ? prev.filter((item) => item !== characterId)
        : [...prev, characterId],
    );
  };

  const handleGenerateSupplementalCharacters = async () => {
    if (supplementalMode === "linked" && characters.length === 0) {
      setSupplementalStatusMessage("There are currently no existing roles, and roles cannot be added based on relationships. You can build a core character first, or use independent fill-ins instead.");
      return;
    }

    try {
      const response = await onGenerateSupplementalCharacters({
        mode: supplementalMode,
        anchorCharacterIds: supplementalMode === "independent" ? [] : supplementalAnchorIds,
        targetCastRole: supplementalTargetRole,
        count: supplementalCount === "auto" ? undefined : Number(supplementalCount),
        userPrompt: supplementalPrompt.trim() || undefined,
        useWorldContext: supplementalUseWorldContext,
        worldFocusHints: supplementalUseWorldContext
          ? { forceCompliance: true }
          : undefined,
      });
      setSupplementalResult(response.data ?? null);
      setSupplementalStatusMessage(response.message ?? "Candidates for the supplementary role have been generated.");
    } catch (error) {
      setSupplementalStatusMessage(error instanceof Error ? error.message : "Supplemental character generation failed.");
    }
  };

  const handleApplySupplementalCharacter = async (candidate: SupplementalCharacterCandidate) => {
    try {
      const response = await onApplySupplementalCharacter(candidate);
      const createdName = response.data?.character?.name ?? candidate.name;
      const relationCount = response.data?.relationCount ?? 0;
      setSupplementalResult((prev) => prev
        ? {
          ...prev,
          candidates: prev.candidates.filter((item) => item.name !== candidate.name),
        }
        : prev);
      setSupplementalStatusMessage(
        response.message
        ?? `${createdName} 已加入当前小说${relationCount > 0 ? `，并同步 ${relationCount} 条关系` : ""}。`,
      );
    } catch (error) {
      setSupplementalStatusMessage(error instanceof Error ? error.message : "Applying supplementary role failed.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-5xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 px-6 pb-0 pt-6">
          <DialogTitle>supplementary roles</DialogTitle>
          <DialogDescription>
            Suitable for complementing opponents, allies, stressors or key relationship figures. AI will combine the existing lineup to provide candidates that can be created.
                                </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-6 pb-6 pt-4 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.1fr)] xl:overflow-hidden">
          <div className="space-y-4 rounded-xl border border-border/70 bg-muted/10 p-4 xl:min-h-0 xl:overflow-y-auto">
            <div className="space-y-1">
              <div className="font-medium">filling method</div>
              <div className="text-xs text-muted-foreground">
                By default, it is left to AI judgment; you can only specify it manually when you clearly know what type of character you want to fill.
                                            </div>
            </div>
            <SelectControl
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={supplementalMode}
              onChange={(event) => setSupplementalMode(event.target.value as SupplementalCharacterGenerationMode)}
            >
              <option value="auto">AI determines which fill position is more needed currently</option>
              <option value="linked">Derive relationship roles based on existing roles</option>
              <option value="independent">Generate relatively independent roles</option>
            </SelectControl>

            {characters.length > 0 && supplementalMode !== "independent" ? (
              <div className="space-y-2">
                <div className="font-medium">Reference to existing roles</div>
                <div className="text-xs text-muted-foreground">
                  Optional; if not selected, the AI ​​will decide who should fill the position.
                                                  </div>
                <div className="max-h-40 space-y-2 overflow-auto rounded-xl border bg-background/70 p-3">
                  {characters.map((character) => (
                    <label key={character.id} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={supplementalAnchorIds.includes(character.id)}
                        onChange={() => toggleSupplementalAnchor(character.id)}
                      />
                      <span>
                        {character.name}
                        <span className="ml-1 text-xs text-muted-foreground">({character.role})</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <div className="font-medium">Desired role functionality</div>
                <SelectControl
                  className="w-full rounded-md border bg-background p-2 text-sm"
                  value={supplementalTargetRole}
                  onChange={(event) => setSupplementalTargetRole(event.target.value as CharacterCastRole | "auto")}
                >
                  <option value="auto">Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.</option>
                  <option value="protagonist">main character</option>
                  <option value="antagonist">main opponent</option>
                  <option value="ally">alliance</option>
                  <option value="foil">mirror role</option>
                  <option value="mentor">tutor</option>
                  <option value="love_interest">emotional pull</option>
                  <option value="pressure_source">stressor</option>
                  <option value="catalyst">Catalyst</option>
                </SelectControl>
              </div>
              <div className="space-y-2">
                <div className="font-medium">Generate quantity</div>
                <SelectControl
                  className="w-full rounded-md border bg-background p-2 text-sm"
                  value={supplementalCount}
                  onChange={(event) => setSupplementalCount(event.target.value as "auto" | "1" | "2" | "3")}
                >
                  <option value="auto">Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                </SelectControl>
              </div>
            </div>

            <div className="space-y-2">
              <div className="font-medium">Additional instructions</div>
              <textarea
                className="min-h-[140px] w-full rounded-xl border bg-background p-3 text-sm"
                placeholder="For example: adding a person who can continue to put pressure on the protagonist, but is not a pure villain; or adding an old acquaintance related to the mother line."
                value={supplementalPrompt}
                onChange={(event) => setSupplementalPrompt(event.target.value)}
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={supplementalUseWorldContext}
                onChange={(event) => setSupplementalUseWorldContext(event.target.checked)}
              />
              Generate a world based on this book
                                      </label>

            <div className="flex flex-wrap gap-2">
              <AiButton
                onClick={handleGenerateSupplementalCharacters}
                disabled={isGeneratingSupplementalCharacters || (supplementalMode === "linked" && characters.length === 0)}
              >
                {isGeneratingSupplementalCharacters ? "Generating..." : "Generate candidates for complementary roles"}
              </AiButton>
              <Badge variant="outline">If the quantity is not selected, it will be judged by AI.</Badge>
              <Badge variant="outline">Relationship roles will be filled first around existing roles.</Badge>
            </div>

            {supplementalStatusMessage ? (
              <div className="rounded-xl border border-border/70 bg-background/80 p-3 text-xs text-muted-foreground">
                {supplementalStatusMessage}
              </div>
            ) : null}
          </div>

          <div className="space-y-3 rounded-xl border border-border/70 bg-background p-4 xl:min-h-0 xl:overflow-y-auto">
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-medium">Candidate results</div>
              {supplementalResult ? <Badge variant="outline">{supplementalResult.candidates.length} candidates</Badge> : null}
              {supplementalResult?.mode ? <Badge variant="outline">This round mode:{SUPPLEMENTAL_MODE_LABELS[supplementalResult.mode]}</Badge> : null}
            </div>
            {supplementalResult?.planningSummary ? (
              <div className="rounded-xl border border-amber-200/60 bg-amber-50/50 p-3 text-xs text-muted-foreground">
                AI judgment:{supplementalResult.planningSummary}
              </div>
            ) : null}

            {isGeneratingSupplementalCharacters ? (
              <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
                Analyzing the current character network and generating fill-in candidates...
                                            </div>
            ) : supplementalResult?.candidates.length ? (
              <div className="space-y-3">
                {supplementalResult.candidates.map((candidate) => (
                  <SupplementalCandidateCard
                    key={candidate.name}
                    candidate={candidate}
                    isApplyingSupplementalCharacter={isApplyingSupplementalCharacter}
                    onApply={() => void handleApplySupplementalCharacter(candidate)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed px-6 text-center text-sm text-muted-foreground">
                First explain what kind of role you want to fill, or directly let the AI ​​judge and then generate candidates.
                                                    </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SupplementalCandidateCard(props: {
  candidate: SupplementalCharacterCandidate;
  isApplyingSupplementalCharacter: boolean;
  onApply: () => void;
}) {
  const { candidate, isApplyingSupplementalCharacter, onApply } = props;

  return (
    <div className="rounded-xl border border-border/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-medium">{candidate.name}</div>
            <Badge variant="outline">{candidate.role}</Badge>
            <Badge variant="secondary">{getCastRoleLabel(candidate.castRole)}</Badge>
            <Badge variant="outline">gender:{getCharacterGenderLabel(candidate.gender)}</Badge>
          </div>
          <div className="text-sm text-muted-foreground">{candidate.summary}</div>
        </div>
        <Button size="sm" onClick={onApply} disabled={isApplyingSupplementalCharacter}>
          {isApplyingSupplementalCharacter ? "Creating..." : "Create this role"}
        </Button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
          <div>Story function:{candidate.storyFunction}</div>
          <div>Relationship with the protagonist:{candidate.relationToProtagonist || "AI unspecified"}</div>
          <div>External goals:{candidate.outerGoal || "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."}</div>
          <div>Current goals:{candidate.currentGoal || "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."}</div>
        </div>
        <div className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
          <div>First impression:{candidate.firstImpression || "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."}</div>
          <div>Core Fear:{candidate.fear || "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."}</div>
          <div>False belief:{candidate.misbelief || "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."}</div>
          <div>Reason for replacement:{candidate.whyNow || "AI No additional explanation"}</div>
        </div>
      </div>

      {candidate.relations.length > 0 ? (
        <div className="mt-3 space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Recommended synchronized relationships</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {candidate.relations.map((relation, index) => (
              <div key={`${candidate.name}-${relation.sourceName}-${relation.targetName}-${index}`} className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
                <div className="font-medium text-foreground">{getSupplementalRelationLabel(candidate, relation)}</div>
                <div>Surface relationship:{relation.surfaceRelation}</div>
                {relation.hiddenTension ? <div>Hidden tension:{relation.hiddenTension}</div> : null}
                {relation.conflictSource ? <div>Source of conflict:{relation.conflictSource}</div> : null}
                {relation.nextTurnPoint ? <div>Next reversal point:{relation.nextTurnPoint}</div> : null}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
          Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.
                              </div>
      )}
    </div>
  );
}
