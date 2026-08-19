export interface WritingFormula {
  id: string;
  name: string;
  sourceText?: string | null;
  content?: string | null;
  genre?: string | null;
  style?: string | null;
  toneVoice?: string | null;
  structure?: string | null;
  pacing?: string | null;
  paragraphPattern?: string | null;
  sentenceStructure?: string | null;
  vocabularyLevel?: string | null;
  rhetoricalDevices?: string | null;
  narrativeMode?: string | null;
  perspectivePoint?: string | null;
  characterVoice?: string | null;
  themes?: string | null;
  motifs?: string | null;
  emotionalTone?: string | null;
  uniqueFeatures?: string | null;
  formulaDescription?: string | null;
  formulaSteps?: string | null;
  applicationTips?: string | null;
  createdAt: string;
  updatedAt: string;
}
