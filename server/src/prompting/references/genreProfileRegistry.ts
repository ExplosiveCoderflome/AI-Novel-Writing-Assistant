import { GENRE_PROFILES, type GenreProfile } from "./genreProfiles";

const GENRE_ALIAS_MAP: Record<string, string> = {
  "爽文": "shuangwen",
  "仙侠": "xianxia",
  "修仙": "xianxia",
  "玄幻": "xianxia",
  "言情": "romance",
  "恋爱": "romance",
  "悬疑": "mystery",
  "推理": "mystery",
  "侦探": "mystery",
  "都市": "urban-power",
  "现代": "urban-power",
  "规则怪谈": "rules-mystery",
  "怪谈": "rules-mystery",
  "无限流": "rules-mystery",
  "历史": "history-travel",
  "穿越": "history-travel",
  "架空历史": "history-travel",
  "游戏": "game-lit",
  "网游": "game-lit",
  "系统流": "game-lit",
};

export class GenreProfileRegistry {
  private profileMap: Map<string, GenreProfile>;

  constructor(profiles: readonly GenreProfile[] = GENRE_PROFILES) {
    this.profileMap = new Map(profiles.map((p) => [p.id, p]));
  }

  getById(id: string): GenreProfile | null {
    return this.profileMap.get(id) ?? null;
  }

  resolve(genreLabel: string | null | undefined): GenreProfile | null {
    if (!genreLabel) return null;
    const normalized = genreLabel.trim().toLowerCase();

    // 1. exact ID match
    const direct = this.profileMap.get(normalized);
    if (direct) return direct;

    // 2. alias match
    const aliasId = GENRE_ALIAS_MAP[genreLabel.trim()];
    if (aliasId) return this.profileMap.get(aliasId) ?? null;

    // 3. partial label match
    for (const profile of this.profileMap.values()) {
      if (profile.label === genreLabel.trim()) return profile;
      if (normalized.includes(profile.id) || normalized.includes(profile.label)) return profile;
    }

    // 4. keyword match
    for (const profile of this.profileMap.values()) {
      if (profile.toneKeywords.some((kw) => normalized.includes(kw))) return profile;
    }

    return null;
  }

  listAll(): GenreProfile[] {
    return Array.from(this.profileMap.values());
  }
}

export const genreProfileRegistry = new GenreProfileRegistry();
