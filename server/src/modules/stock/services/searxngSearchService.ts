import { prisma } from "../../../db/prisma";

export interface SearXNGResultItem {
  title: string;
  url: string;
  content: string;
  publishedDate?: string;
  engine?: string;
}

export interface SearXNGResponse {
  query: string;
  results?: SearXNGResultItem[];
}

export interface SearXNGStatus {
  connected: boolean;
  searxngUrl: string;
  message: string;
}

export class SearXNGSearchService {
  private get baseUrl(): string {
    return process.env.SEARXNG_URL || "http://127.0.0.1:8088";
  }

  /**
   * 检查本地 SearXNG 容器服务的连通状态
   */
  public async getStatus(): Promise<SearXNGStatus> {
    const searxngUrl = this.baseUrl;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const targetUrl = new URL(`${searxngUrl}/search`);
      targetUrl.searchParams.set("q", "US stock market");
      targetUrl.searchParams.set("format", "json");

      const resp = await fetch(targetUrl.toString(), {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (resp.ok) {
        const data = (await resp.json()) as SearXNGResponse;
        if (Array.isArray(data?.results)) {
          return {
            connected: true,
            searxngUrl,
            message: `🟢 本地 SearXNG 服务已正常连通 (${searxngUrl})`,
          };
        }
      }

      return {
        connected: false,
        searxngUrl,
        message: `⚠️ SearXNG 响应异常，请检查 settings.yml 中是否已开启 "search.formats: [json]"`,
      };
    } catch (err: any) {
      return {
        connected: false,
        searxngUrl,
        message: `🔴 未检测到本地 SearXNG Docker 服务 (${searxngUrl})，请确保容器已启动: ${err.message || err}`,
      };
    }
  }

  /**
   * 按搜索关键词向 SearXNG 请求实时美股新闻
   */
  public async searchStockNews(query: string, maxResults = 5): Promise<SearXNGResultItem[]> {
    const searxngUrl = this.baseUrl;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const targetUrl = new URL(`${searxngUrl}/search`);
      targetUrl.searchParams.set("q", `${query} stock news`);
      targetUrl.searchParams.set("format", "json");
      targetUrl.searchParams.set("language", "en");

      const resp = await fetch(targetUrl.toString(), {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!resp.ok) {
        return [];
      }

      const data = (await resp.json()) as SearXNGResponse;
      const results = data?.results || [];

      return results.slice(0, maxResults).map((r: SearXNGResultItem) => ({
        title: r.title || "",
        url: r.url || "",
        content: r.content || "",
        publishedDate: r.publishedDate,
        engine: r.engine,
      }));
    } catch (err: any) {
      console.warn(`[SearXNG] 检索关键词 "${query}" 失败:`, err.message || err);
      return [];
    }
  }

  /**
   * 确保本地 SearXNG 容器已启动。若未连通，自动尝试唤起本地 Docker / WSL SearXNG 容器
   */
  public async ensureSearXNGRunning(): Promise<SearXNGStatus> {
    let status = await this.getStatus();
    if (status.connected) {
      return status;
    }

    console.log("[SearXNGSearchService] SearXNG 容器未连通，正在自动尝试拉起本地 Docker / WSL SearXNG 容器...");
    const { execSync } = require("child_process");

    // 尝试 1: 直接在 Windows 宿主机运行 docker start / run
    try {
      execSync("docker start searxng", { stdio: "ignore", timeout: 8000 });
    } catch (e1) {
      try {
        execSync("docker run -d -p 8088:8080 --name searxng searxng/searxng:latest", { stdio: "ignore", timeout: 15000 });
      } catch (e1_2) {}
    }

    // 检查宿主机直接连通状态
    status = await this.getStatus();
    if (status.connected) {
      console.log("[SearXNGSearchService] 🟢 宿主机 Docker SearXNG 唤醒成功！");
      return status;
    }

    // 尝试 2: 唤起 WSL Ubuntu 中的 Docker 服务及 searxng 容器
    try {
      // 先启动 WSL docker 后台守护进程
      try {
        execSync("wsl -d Ubuntu -u root service docker start", { stdio: "ignore", timeout: 10000 });
      } catch (wslDockerErr) {}

      // 启动或创建 searxng 容器
      try {
        execSync("wsl -d Ubuntu -u root docker start searxng", { stdio: "ignore", timeout: 8000 });
      } catch (wslStartErr) {
        try {
          execSync("wsl -d Ubuntu -u root docker run -d -p 8088:8080 --name searxng searxng/searxng:latest", { stdio: "ignore", timeout: 20000 });
        } catch (wslRunErr) {}
      }
    } catch (e2) {
      console.warn("[SearXNGSearchService] WSL Docker auto-start notice:", e2);
    }

    // 轮询检查连通性 (最多等待 10 秒)
    for (let attempt = 1; attempt <= 10; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      status = await this.getStatus();
      if (status.connected) {
        console.log(`[SearXNGSearchService] 🟢 SearXNG 容器在第 ${attempt} 秒成功启动并完成初始化连通！`);
        return status;
      }
    }

    console.warn("[SearXNGSearchService] 🔴 SearXNG 自动拉起重试完成，当前状态:", status.message);
    return status;
  }

  /**
   * 为给定的股票 Symbol 列表与大盘检索实时新闻，并落库缓存至 StockMarketIntelCache
   */
  public async fetchAndCacheMarketNews(symbols: string[]): Promise<{
    rawNewsText: string;
    newsItemsCount: number;
    searxngConnected: boolean;
  }> {
    const status = await this.ensureSearXNGRunning();
    if (!status.connected) {
      return {
        rawNewsText: "",
        newsItemsCount: 0,
        searxngConnected: false,
      };
    }

    const todayStr = new Date().toISOString().split("T")[0];
    const queries = Array.from(new Set(["US market Fed inflation", ...symbols.slice(0, 5)]));
    const allFetchedNews: Array<{ symbol?: string; title: string; summary: string }> = [];

    for (const q of queries) {
      const isSymbol = q !== "US market Fed inflation";
      const results = await this.searchStockNews(q, 4);

      for (const item of results) {
        if (!item.title && !item.content) continue;
        const cleanTitle = item.title.replace(/<\/?[^>]+(>|$)/g, "").trim();
        const cleanSummary = item.content.replace(/<\/?[^>]+(>|$)/g, "").trim();

        if (cleanTitle) {
          allFetchedNews.push({
            symbol: isSymbol ? q : undefined,
            title: cleanTitle,
            summary: cleanSummary,
          });

          // 落库保存到 StockMarketIntelCache
          try {
            await prisma.stockMarketIntelCache.create({
              data: {
                intelDate: todayStr,
                symbol: isSymbol ? q : null,
                title: cleanTitle,
                summary: cleanSummary,
                source: item.url ? `SearXNG (${new URL(item.url).hostname})` : "SearXNG",
              },
            });
          } catch (e) {
            // 忽略重复落库或底层异常
          }
        }
      }
    }

    // 拼接格式化新闻字符串
    const rawNewsText = allFetchedNews
      .map((n) => `[${n.symbol ? n.symbol : "MACRO"}] ${n.title}。${n.summary}`)
      .join("\n");

    return {
      rawNewsText,
      newsItemsCount: allFetchedNews.length,
      searxngConnected: true,
    };
  }
}

export const searxngSearchService = new SearXNGSearchService();
