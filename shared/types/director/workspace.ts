import type {SimpleCreationShelfProjection} from "../novel";
import type {Character} from "../novelCharacter";
import type {StoryWorldSlice} from "../storyWorldSlice";
import type {World, WorldStructuredData} from "../world";

type ShelfMaterials = SimpleCreationShelfProjection["materials"];

export type DirectorWorldMaterials = NonNullable<ShelfMaterials["world"]> & {
  id?: string;
  source?: "novel" | "library";
  structure?: WorldStructuredData | null;
  storySlice?: StoryWorldSlice | null;
  warnings?: string[];
  legacyLayers?: Pick<World, "background" | "geography" | "cultures" | "magicSystem" | "politics"
    | "races" | "religions" | "technology" | "conflicts" | "history" | "economy" | "factions" | "axioms">;
};

export type DirectorCharacterMaterials = ShelfMaterials["characters"][number] & Pick<Character,
  "castRole" | "currentState" | "background" | "development" | "relationToProtagonist" | "identityLabel" | "factionLabel" | "stanceLabel"
  | "powerLevel" | "realm" | "outerGoal" | "innerNeed" | "fear" | "wound" | "misbelief" | "secret" | "moralLine"
  | "firstImpression" | "appearance" | "physique" | "attireStyle" | "signatureDetail" | "voiceTexture"
  | "presenceImpression" | "arcStart" | "arcMidpoint" | "arcClimax" | "arcEnd">;

export type DirectorWorkspaceMaterials = Omit<ShelfMaterials, "world" | "characters" | "story"> & {
  world: DirectorWorldMaterials | null;
  characters: DirectorCharacterMaterials[];
  story: ShelfMaterials["story"] & {
    chapter3Payoff?: string | null;
    chapter10Payoff?: string | null;
    chapter30Payoff?: string | null;
    escalationLadder?: string | null;
    relationshipMainline?: string | null;
    absoluteRedLines?: string[];
  };
};
