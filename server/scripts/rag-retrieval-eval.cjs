const fs = require("node:fs");
const path = require("node:path");

const serverRoot = path.resolve(__dirname, "..");
const defaultGoldenPath = path.join(serverRoot, "tests", "fixtures", "rag-retrieval-golden.json");

function parseArgs(argv) {
  const args = {
    golden: defaultGoldenPath,
    results: "",
    k: 8,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--golden" && value) {
      args.golden = path.resolve(value);
      index += 1;
    } else if (key === "--results" && value) {
      args.results = path.resolve(value);
      index += 1;
    } else if (key === "--k" && value) {
      args.k = Math.max(1, Number(value) || args.k);
      index += 1;
    }
  }
  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeCases(payload) {
  const cases = Array.isArray(payload) ? payload : payload.cases;
  if (!Array.isArray(cases)) {
    throw new Error("Golden file must contain a cases array.");
  }
  return cases;
}

function normalizeResults(payload) {
  const rows = Array.isArray(payload) ? payload : payload.results;
  if (!Array.isArray(rows)) {
    throw new Error("Results file must contain a results array.");
  }
  return new Map(rows.map((row) => [row.id, row]));
}

function getHitId(hit) {
  return String(hit.chunkId ?? hit.id ?? "");
}

function getOwnerId(hit) {
  return String(hit.ownerId ?? "");
}

function getHitText(hit) {
  return String(hit.text ?? hit.chunkText ?? hit.context ?? "");
}

function hasExpectedHit(caseItem, hit) {
  const expectedChunkIds = new Set(caseItem.expectedChunkIds ?? []);
  const expectedOwnerIds = new Set(caseItem.expectedOwnerIds ?? []);
  return (expectedChunkIds.size > 0 && expectedChunkIds.has(getHitId(hit)))
    || (expectedOwnerIds.size > 0 && expectedOwnerIds.has(getOwnerId(hit)));
}

function computeCaseMetrics(caseItem, result, k) {
  const hits = Array.isArray(result?.hits) ? result.hits.slice(0, k) : [];
  const firstRelevantIndex = hits.findIndex((hit) => hasExpectedHit(caseItem, hit));
  const expectedTerms = Array.isArray(caseItem.expectedContextTerms) ? caseItem.expectedContextTerms : [];
  const matchedTerms = expectedTerms.filter((term) =>
    hits.some((hit) => getHitText(hit).includes(term)),
  );
  const relevantHits = hits.filter((hit) => hasExpectedHit(caseItem, hit)).length;

  return {
    hit: firstRelevantIndex >= 0 ? 1 : 0,
    reciprocalRank: firstRelevantIndex >= 0 ? 1 / (firstRelevantIndex + 1) : 0,
    contextPrecision: hits.length > 0 ? relevantHits / hits.length : 0,
    contextRecall: expectedTerms.length > 0 ? matchedTerms.length / expectedTerms.length : 0,
    rerankerMs: Number(result?.rerankerMs ?? result?.timings?.rerankerMs ?? 0) || 0,
  };
}

function average(rows, key) {
  if (rows.length === 0) {
    return 0;
  }
  return rows.reduce((sum, row) => sum + row[key], 0) / rows.length;
}

function main() {
  const args = parseArgs(process.argv);
  const cases = normalizeCases(readJson(args.golden));
  if (!args.results) {
    console.log(JSON.stringify({
      golden: args.golden,
      cases: cases.length,
      requiredResultShape: {
        results: [{
          id: cases[0]?.id ?? "case-id",
          hits: [{ chunkId: "chunk-id", ownerId: "owner-id", text: "returned context text" }],
          timings: { rerankerMs: 0 },
        }],
      },
    }, null, 2));
    return;
  }

  const resultById = normalizeResults(readJson(args.results));
  const caseMetrics = cases.map((caseItem) => ({
    id: caseItem.id,
    category: caseItem.category,
    ...computeCaseMetrics(caseItem, resultById.get(caseItem.id), args.k),
  }));
  const categories = Array.from(new Set(caseMetrics.map((item) => item.category)));
  const byCategory = Object.fromEntries(categories.map((category) => {
    const rows = caseMetrics.filter((item) => item.category === category);
    return [category, {
      cases: rows.length,
      hitAtK: Number(average(rows, "hit").toFixed(4)),
      mrr: Number(average(rows, "reciprocalRank").toFixed(4)),
      contextPrecision: Number(average(rows, "contextPrecision").toFixed(4)),
      contextRecall: Number(average(rows, "contextRecall").toFixed(4)),
    }];
  }));

  console.log(JSON.stringify({
    k: args.k,
    cases: cases.length,
    hitAtK: Number(average(caseMetrics, "hit").toFixed(4)),
    mrr: Number(average(caseMetrics, "reciprocalRank").toFixed(4)),
    contextPrecision: Number(average(caseMetrics, "contextPrecision").toFixed(4)),
    contextRecall: Number(average(caseMetrics, "contextRecall").toFixed(4)),
    averageRerankerMs: Number(average(caseMetrics, "rerankerMs").toFixed(2)),
    byCategory,
  }, null, 2));
}

main();
