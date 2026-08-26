import type { MarketRadarListSource, MarketRadarPlatform } from "@ai-novel/shared/types/marketRadar";

export interface CollectedRankingItem {
  rank: number;
  title: string;
  author?: string;
  category?: string;
  tags: string[];
  synopsis?: string;
  heatLabel?: string;
  serialStatus?: string;
  sourceUrl: string;
}

export const MARKET_RADAR_SOURCES: MarketRadarListSource[] = [
  { platform: "fanqie", platformLabel: "番茄小说", listKey: "reading", listLabel: "阅读榜", channel: "general", sourceUrl: "https://fanqienovel.com/rank" },
  { platform: "fanqie", platformLabel: "番茄小说", listKey: "new_book", listLabel: "新书榜", channel: "general", sourceUrl: "https://fanqienovel.com/rank/1_1" },
  { platform: "qidian", platformLabel: "起点中文网", listKey: "hotsales", listLabel: "畅销榜", channel: "male", sourceUrl: "https://m.qidian.com/rank/hotsales/" },
  { platform: "qidian", platformLabel: "起点中文网", listKey: "monthly_ticket", listLabel: "月票榜", channel: "male", sourceUrl: "https://m.qidian.com/rank/yuepiao/" },
  { platform: "qidian", platformLabel: "起点中文网", listKey: "new_book", listLabel: "新书榜", channel: "male", sourceUrl: "https://m.qidian.com/rank/" },
  { platform: "jinjiang", platformLabel: "晋江文学城", listKey: "monthly", listLabel: "月度榜", channel: "female", sourceUrl: "https://m.jjwxc.net/rank/naturalmore/5" },
  { platform: "jinjiang", platformLabel: "晋江文学城", listKey: "quarterly", listLabel: "季度榜", channel: "female", sourceUrl: "https://m.jjwxc.net/rank/naturalmore/6" },
  { platform: "jinjiang", platformLabel: "晋江文学城", listKey: "new_author", listLabel: "新晋作者榜", channel: "female", sourceUrl: "https://m.jjwxc.net/rank/naturalmore/29" },
];

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"',
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, key: string) => {
    if (key.startsWith("#")) {
      const hexadecimal = key[1]?.toLowerCase() === "x";
      const code = Number.parseInt(key.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    }
    return NAMED_ENTITIES[key.toLowerCase()] ?? "";
  });
}

function plainText(value: string | undefined): string {
  return decodeEntities((value ?? "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function absoluteUrl(base: string, value: string): string {
  return new URL(value.startsWith("//") ? `https:${value}` : value, base).toString();
}

function extractTags(synopsis: string): string[] {
  const bracketed = synopsis.match(/^[【〖\[]([^】〗\]]+)[】〗\]]/g) ?? [];
  return bracketed.flatMap((part) => plainText(part).replace(/^[【〖\[]|[】〗\]]$/g, "").split(/[+＋、|]/))
    .map((tag) => tag.trim()).filter(Boolean).slice(0, 12);
}

export function hasPrivateUseCharacters(value: string | null | undefined): boolean {
  return /[\uE000-\uF8FF]/u.test(value ?? "");
}

export function parseFanqieRanking(html: string, source: MarketRadarListSource): CollectedRankingItem[] {
  const blocks = html.match(/<div class="rank-book-item">[\s\S]*?(?=<div class="rank-book-item">|<\/main>|<footer|<\/body>)/g) ?? [];
  return blocks.slice(0, 30).flatMap((block, index) => {
    const titleMatch = block.match(/<div class="title">\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!titleMatch) return [];
    const synopsis = plainText(block.match(/<div class="desc abstract[^>]*>([\s\S]*?)<\/div>/)?.[1]);
    const footer = plainText(block.match(/<div class="book-item-footer">([\s\S]*?)<\/div>/)?.[1]);
    return [{
      rank: Number(block.match(/book-item-index"><h1>(\d+)<\/h1>/)?.[1] ?? index + 1),
      title: plainText(titleMatch[2]),
      author: plainText(block.match(/<div class="author">[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/)?.[1]),
      tags: extractTags(synopsis),
      synopsis: synopsis.slice(0, 800),
      heatLabel: footer.match(/在读[^\s，。]*/)?.[0],
      serialStatus: footer.match(/连载中|已完结/)?.[0],
      sourceUrl: absoluteUrl(source.sourceUrl, titleMatch[1]),
    }];
  });
}

export function parseFanqieDetail(html: string, item: CollectedRankingItem): CollectedRankingItem {
  const title = plainText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]);
  const author = plainText(html.match(/author-name-text[^>]*>([\s\S]*?)<\/a>/)?.[1]);
  const synopsis = plainText(html.match(/<div class="page-abstract-content"[^>]*>\s*<p[^>]*>([\s\S]*?)<\/p>/)?.[1]);
  if (!title || hasPrivateUseCharacters(title)) throw new Error("作品详情页未提供可读书名");
  return {
    ...item,
    title,
    author: author && !hasPrivateUseCharacters(author) ? author : undefined,
    synopsis: synopsis && !hasPrivateUseCharacters(synopsis) ? synopsis.slice(0, 800) : undefined,
    tags: synopsis && !hasPrivateUseCharacters(synopsis) ? extractTags(synopsis) : [],
  };
}

export function parseQidianRanking(html: string, source: MarketRadarListSource): CollectedRankingItem[] {
  const escapedLabel = source.listLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const itemPattern = new RegExp(`<a[^>]+href="([^"]*\\/book\\/[^"?]+)[^"]*"[^>]*>[\\s\\S]*?<h2[^>]+title="${escapedLabel}第(\\d+)位"[^>]*>([\\s\\S]*?)<\\/h2>[\\s\\S]*?<p[^>]*class="[^"]*subTitle[^"]*"[^>]*>([\\s\\S]*?)<\\/p>[\\s\\S]*?<\\/a>`, "g");
  return Array.from(html.matchAll(itemPattern)).slice(0, 30).map((match) => {
    const subTitle = plainText(match[4]);
    const parts = subTitle.split("·").map((part) => part.trim()).filter(Boolean);
    return {
      rank: Number(match[2]),
      title: plainText(match[3]),
      author: parts[0],
      category: parts[1],
      tags: parts[1] ? [parts[1]] : [],
      heatLabel: parts[2],
      sourceUrl: absoluteUrl(source.sourceUrl, match[1]),
    };
  });
}

export function parseJinjiangRanking(html: string, source: MarketRadarListSource): CollectedRankingItem[] {
  const items = Array.from(html.matchAll(/<li[^>]*>\s*<a href="(\/book2\/\d+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/li>/g));
  return items.slice(0, 30).map((match, index) => ({
    rank: index + 1,
    title: plainText(match[2]),
    tags: [],
    sourceUrl: absoluteUrl(source.sourceUrl, match[1]),
  }));
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; AI-Novel-Market-Radar/1.0; public-ranking-metadata-only)" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`榜单页面返回 HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  const headerCharset = response.headers.get("content-type")?.match(/charset=([^;]+)/i)?.[1]?.trim();
  const metaProbe = new TextDecoder("latin1").decode(bytes.slice(0, 4096));
  const metaCharset = metaProbe.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1];
  const charset = headerCharset || metaCharset || "utf-8";
  return new TextDecoder(charset).decode(bytes);
}

async function hydrateFanqieItems(items: CollectedRankingItem[]): Promise<CollectedRankingItem[]> {
  const hydrated: CollectedRankingItem[] = [];
  for (let offset = 0; offset < items.length; offset += 4) {
    const batch = await Promise.all(items.slice(offset, offset + 4).map(async (item) => {
      const containsObfuscatedText = [item.title, item.author, item.synopsis].some(hasPrivateUseCharacters);
      if (!containsObfuscatedText) return item;
      try { return parseFanqieDetail(await fetchHtml(item.sourceUrl), item); }
      catch { return null; }
    }));
    hydrated.push(...batch.filter((item): item is CollectedRankingItem => item !== null));
  }
  return hydrated;
}

export async function collectMarketSource(source: MarketRadarListSource): Promise<CollectedRankingItem[]> {
  const html = await fetchHtml(source.sourceUrl);
  const parsers: Record<MarketRadarPlatform, (value: string, item: MarketRadarListSource) => CollectedRankingItem[]> = {
    fanqie: parseFanqieRanking,
    qidian: parseQidianRanking,
    jinjiang: parseJinjiangRanking,
  };
  const parsed = parsers[source.platform](html, source);
  const items = source.platform === "fanqie" ? await hydrateFanqieItems(parsed) : parsed;
  if (items.length === 0) throw new Error("榜单页面结构可能已变化，未识别到公开作品元数据");
  return items;
}
