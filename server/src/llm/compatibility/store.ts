import { prisma } from "../../db/prisma";
import { builtinCapability } from "./defaults";
import { capabilityProfileSchema, identityKey, type ModelCapabilityProfile, type ModelIdentity, type StructuredMode } from "./profile";

const prefix = "modelCompatibility.v1.";
const cache = new Map<string, { probed?: ModelCapabilityProfile; user_override?: ModelCapabilityProfile }>();
const loads = new Map<string, Promise<void>>();
let writes: Promise<unknown> = Promise.resolve();
export function storedCapability(input: ModelIdentity): ModelCapabilityProfile | undefined {
  const exact = cache.get(identityKey(input));
  const generic = cache.get(identityKey({ ...input, baseURL: undefined }));
  return exact?.user_override ?? generic?.user_override ?? exact?.probed ?? generic?.probed;
}
export function resolveCapability(input: ModelIdentity): ModelCapabilityProfile { return storedCapability(input) ?? builtinCapability(input); }
export async function loadCapability(input: ModelIdentity): Promise<ModelCapabilityProfile> {
  for (const identity of [input, { ...input, baseURL: undefined }]) {
    const id = identityKey(identity);
    if (!loads.has(id)) loads.set(id, (async () => {
      const rows = await prisma.appSetting.findMany({ where: { key: { in: [prefix + id + ".probed", prefix + id + ".user_override"] } } });
      const entry: { probed?: ModelCapabilityProfile; user_override?: ModelCapabilityProfile } = {};
      for (const row of rows) {
        const profile = capabilityProfileSchema.parse(JSON.parse(row.value));
        if (profile.source !== "builtin_default") entry[profile.source] = profile;
      }
      cache.set(id, entry);
    })().catch((error) => { loads.delete(id); throw error; }));
    await loads.get(id);
  }
  return resolveCapability(input);
}
export async function saveCapability(input: ModelIdentity, value: ModelCapabilityProfile): Promise<ModelCapabilityProfile> {
  const profile = capabilityProfileSchema.parse({ ...value, updatedAt: new Date().toISOString() });
  if (profile.source === "builtin_default") throw new Error("Only probed capabilities and user overrides are persisted.");
  const id = identityKey(input);
  const key = prefix + id + "." + profile.source;
  await prisma.appSetting.upsert({ where: { key }, create: { key, value: JSON.stringify(profile) }, update: { value: JSON.stringify(profile) } });
  cache.set(id, { ...cache.get(id), [profile.source]: profile });
  return profile;
}
export async function recordFailedMode(input: ModelIdentity, mode: StructuredMode): Promise<void> {
  if (mode === "prompt_only") return;
  // Serialize read/modify/write so concurrent failures cannot erase each other.
  const write = writes.catch(() => undefined).then(async () => {
    const previous = await loadCapability(input);
    if (previous.failedModes.includes(mode)) return;
    await saveCapability(input, { ...previous, source: previous.source === "user_override" ? "user_override" : "probed", failedModes: [...previous.failedModes, mode] });
  });
  writes = write;
  await write;
}
