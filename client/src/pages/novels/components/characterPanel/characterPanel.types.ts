import type {
  Character,
  CharacterGender,
  SupplementalCharacterGenerateInput,
  SupplementalCharacterGenerationResult,
  SupplementalCharacterCandidate,
} from "@ai-novel/shared/types/novel";
import type { QuickCharacterCreatePayload } from "../characterPanel.utils";

export interface QuickCharacterFormState {
  name: string;
  role: string;
}

export interface CharacterFormState {
  name: string;
  role: string;
  gender: CharacterGender;
  personality: string;
  background: string;
  development: string;
  appearance: string;
  physique: string;
  attireStyle: string;
  signatureDetail: string;
  voiceTexture: string;
  presenceImpression: string;
  currentState: string;
  currentGoal: string;
}

export interface CharacterCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quickCharacterForm: QuickCharacterFormState;
  onQuickCharacterFormChange: (field: keyof QuickCharacterFormState, value: string) => void;
  onQuickCreateCharacter: (payload: QuickCharacterCreatePayload) => void;
  isQuickCreating: boolean;
}

export interface SupplementalCharacterDialogActions {
  onGenerateSupplementalCharacters: (payload: SupplementalCharacterGenerateInput) => Promise<{
    data?: SupplementalCharacterGenerationResult;
    message?: string;
  }>;
  onApplySupplementalCharacter: (candidate: SupplementalCharacterCandidate) => Promise<{
    data?: { character?: Character; relationCount?: number };
    message?: string;
  }>;
}
