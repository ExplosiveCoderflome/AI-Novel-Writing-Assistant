import { searxngSearchService } from "../src/modules/stock/services/searxngSearchService";

async function main() {
  console.log("==================================================");
  console.log("🔍 SearXNG 真实本地环境检索测试 (无 Mock)");
  console.log("==================================================");

  // 1. 真实请求探测 SearXNG 连通状态
  const status = await searxngSearchService.getStatus();
  console.log("\n[1] SearXNG 连通状态真实检测:");
  console.log(`- Connected: ${status.connected}`);
  console.log(`- Base URL:  ${status.searxngUrl}`);
  console.log(`- Message:   ${status.message}`);

  // 2. 真实发起 NVDA 新闻检索
  console.log("\n[2] 真实向 SearXNG 发起关键词 'NVDA' 美股新闻检索...");
  const newsResults = await searxngSearchService.searchStockNews("NVDA", 3);
  console.log(`- 真实获取新闻数量: ${newsResults.length}`);

  if (newsResults.length > 0) {
    newsResults.forEach((item, idx) => {
      console.log(`\n  --- 真实新闻 ${idx + 1} ---`);
      console.log(`  标题: ${item.title}`);
      console.log(`  链接: ${item.url}`);
      console.log(`  摘要: ${item.content.slice(0, 150)}...`);
    });
  }

  // 3. 真实发起批量美股新闻组装测试
  console.log("\n[3] 真实执行美股组合 (NVDA, TSLA) 批量检索与数据落库...");
  const batchRes = await searxngSearchService.fetchAndCacheMarketNews(["NVDA", "TSLA"]);
  console.log(`- SearXNG 连通: ${batchRes.searxngConnected}`);
  console.log(`- 切片新闻条数: ${batchRes.newsItemsCount}`);
  if (batchRes.rawNewsText) {
    console.log(`- 格式化新闻切片文本:\n${batchRes.rawNewsText}`);
  }

  console.log("\n==================================================");
  console.log("✅ 真实测试运行完毕！");
  console.log("==================================================");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ 真实测试运行异常:", err);
  process.exit(1);
});
