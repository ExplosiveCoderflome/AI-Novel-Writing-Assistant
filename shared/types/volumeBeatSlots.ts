export const VOLUME_BEAT_REQUIRED_SLOT_KEYS = [
  "open_hook",
  "first_escalation",
  "midpoint_turn",
  "pressure_lock",
  "climax",
  "end_hook",
] as const;

export const VOLUME_BEAT_OPTIONAL_SLOT_KEYS = [
  "early_complication",
  "late_complication",
] as const;

export type VolumeBeatRequiredSlotKey = (typeof VOLUME_BEAT_REQUIRED_SLOT_KEYS)[number];
export type VolumeBeatOptionalSlotKey = (typeof VOLUME_BEAT_OPTIONAL_SLOT_KEYS)[number];
export type VolumeBeatSlotKey = VolumeBeatRequiredSlotKey | VolumeBeatOptionalSlotKey;

export interface VolumeBeatSlotDefinition {
  key: VolumeBeatSlotKey;
  roleLabel: string;
  required: boolean;
  order: number;
  aliases: string[];
}

export const VOLUME_BEAT_SLOT_DEFINITIONS: VolumeBeatSlotDefinition[] = [
  {
    key: "open_hook",
    roleLabel: "开卷抓手",
    required: true,
    order: 1,
    aliases: ["开卷抓手", "开局", "开卷", "opening", "open", "hook"],
  },
  {
    key: "first_escalation",
    roleLabel: "首次升级",
    required: true,
    order: 2,
    aliases: ["首次升级", "第一次升级", "第一次升级或反制", "升级", "反制", "first_upgrade"],
  },
  {
    key: "early_complication",
    roleLabel: "早期变数",
    required: false,
    order: 3,
    aliases: ["早期变数", "早期转折", "early_turn"],
  },
  {
    key: "midpoint_turn",
    roleLabel: "中段转向",
    required: true,
    order: 4,
    aliases: ["中段转向", "中盘转向", "中段", "midpoint", "mid_turn"],
  },
  {
    key: "pressure_lock",
    roleLabel: "高潮前挤压",
    required: true,
    order: 5,
    aliases: ["高潮前挤压", "挤压", "压力锁定", "pressure", "pre_climax"],
  },
  {
    key: "late_complication",
    roleLabel: "后段变数",
    required: false,
    order: 6,
    aliases: ["后段变数", "后段转折", "late_turn"],
  },
  {
    key: "climax",
    roleLabel: "卷高潮",
    required: true,
    order: 7,
    aliases: ["卷高潮", "高潮", "climax_beat"],
  },
  {
    key: "end_hook",
    roleLabel: "卷尾钩子",
    required: true,
    order: 8,
    aliases: ["卷尾钩子", "尾钩", "结尾钩子", "end", "ending_hook"],
  },
];

const SLOT_BY_KEY = new Map(VOLUME_BEAT_SLOT_DEFINITIONS.map((slot) => [slot.key, slot]));

function normalizeLookupToken(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_\-·・]+/g, "");
}

const SLOT_BY_ALIAS = new Map<string, VolumeBeatSlotDefinition>();
for (const slot of VOLUME_BEAT_SLOT_DEFINITIONS) {
  SLOT_BY_ALIAS.set(normalizeLookupToken(slot.key), slot);
  SLOT_BY_ALIAS.set(normalizeLookupToken(slot.roleLabel), slot);
  for (const alias of slot.aliases) {
    SLOT_BY_ALIAS.set(normalizeLookupToken(alias), slot);
  }
}

export function isVolumeBeatSlotKey(value: string): value is VolumeBeatSlotKey {
  return SLOT_BY_KEY.has(value as VolumeBeatSlotKey);
}

export function getVolumeBeatSlot(key: string | null | undefined): VolumeBeatSlotDefinition | null {
  if (!key) {
    return null;
  }
  return SLOT_BY_KEY.get(key as VolumeBeatSlotKey) ?? null;
}

export function resolveVolumeBeatSlotKey(raw: string | null | undefined): VolumeBeatSlotKey | null {
  if (!raw) {
    return null;
  }
  const direct = raw.trim();
  if (isVolumeBeatSlotKey(direct)) {
    return direct;
  }
  return SLOT_BY_ALIAS.get(normalizeLookupToken(direct))?.key ?? null;
}

export function getVolumeBeatRoleLabel(key: string | null | undefined, fallback = "节奏段"): string {
  return getVolumeBeatSlot(key)?.roleLabel ?? fallback;
}

export function formatVolumeBeatDisplayLabel(input: {
  key?: string | null;
  label?: string | null;
  title?: string | null;
}): string {
  const roleLabel = getVolumeBeatRoleLabel(input.key, input.label?.trim() || "节奏段");
  const title = input.title?.trim() || "";
  if (!title || title === roleLabel) {
    return roleLabel;
  }
  const composedPrefix = `${roleLabel} · `;
  if (title.startsWith(composedPrefix)) {
    return title;
  }
  return `${roleLabel} · ${title}`;
}

export function listMissingRequiredVolumeBeatKeys(keys: Array<string | null | undefined>): VolumeBeatRequiredSlotKey[] {
  const present = new Set(
    keys
      .map((key) => resolveVolumeBeatSlotKey(key) ?? (typeof key === "string" ? key.trim() : ""))
      .filter(Boolean),
  );
  return VOLUME_BEAT_REQUIRED_SLOT_KEYS.filter((key) => !present.has(key));
}
