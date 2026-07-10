const fs = require("node:fs");
const path = require("node:path");

const SITE_ORIGIN = "https://gonghan-princess.github.io";
const SITE_PATH = "/AI-Novel-Writing-Assistant";
const SITE_BASE = `${SITE_ORIGIN}${SITE_PATH}/`;

const repoRoot = path.resolve(__dirname, "..", "..");
const manifestPath = path.join(repoRoot, "site", "src", "docsManifest.ts");
const outputPath = path.join(repoRoot, "site", "public", "sitemap.xml");

function extractDocIds(manifestSource) {
  const ids = [];
  const docCallPattern = /\bdoc\(\s*"([^"]+)"/g;
  let match;
  while ((match = docCallPattern.exec(manifestSource)) !== null) {
    ids.push(match[1]);
  }
  return ids;
}

function buildSitemap(docIds) {
  const lastmod = new Date().toISOString().slice(0, 10);
  const homeEntry = `  <url>
    <loc>${SITE_BASE}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>`;

  const docsEntry = `  <url>
    <loc>${SITE_BASE}docs</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>`;

  const docEntries = docIds.map((id, index) => `  <url>
    <loc>${SITE_BASE}docs/${id}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${index < 4 ? "0.8" : "0.7"}</priority>
  </url>`);

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[homeEntry, docsEntry, ...docEntries].join("\n")}
</urlset>
`;
}

const manifestSource = fs.readFileSync(manifestPath, "utf8");
const docIds = extractDocIds(manifestSource);
if (docIds.length === 0) {
  console.error("sitemap generation: no doc IDs extracted from docsManifest.ts");
  process.exit(1);
}

const sitemap = buildSitemap(docIds);
fs.writeFileSync(outputPath, sitemap);
console.log(`sitemap generated: ${docIds.length + 2} URLs → site/public/sitemap.xml`);
