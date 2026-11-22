import { isProtagonistCharacter } from "../../characterAssetWorkspace.helpers.ts";
import type { RelationshipGraphCharacter } from "../characterRelationshipGraphModel";

export const CARD_WIDTH = 196;
export const CARD_HEIGHT = 148;
export const COLUMN_STEP = CARD_WIDTH + 104;
export const ROW_STEP = CARD_HEIGHT + 84;

function castBand(character: RelationshipGraphCharacter) {
  if (isProtagonistCharacter(character)) return 0;
  if (character.castRole === "ally" || character.castRole === "mentor") return 1;
  if (character.castRole === "antagonist" || character.castRole === "pressure_source") return 2;
  return 3;
}

const nameOrder = new Intl.Collator("zh-Hans-CN", { numeric: true });

export function compareCharacterNames(a: RelationshipGraphCharacter, b: RelationshipGraphCharacter) {
  return nameOrder.compare(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function orderedCastLayout(characters: RelationshipGraphCharacter[]) {
  const columns = Math.max(1, Math.ceil(Math.sqrt(characters.length)));
  const bands: RelationshipGraphCharacter[][] = [[], [], [], []];
  for (const character of characters) bands[castBand(character)].push(character);
  const positions = new Map<string, { x: number; y: number }>();
  let firstRow = 0;
  for (const band of bands) {
    band.sort(compareCharacterNames).forEach((character, index) => {
      positions.set(character.id, { x: (index % columns) * COLUMN_STEP, y: (firstRow + Math.floor(index / columns)) * ROW_STEP });
    });
    firstRow += Math.ceil(band.length / columns);
  }
  return positions;
}
