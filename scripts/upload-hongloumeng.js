// upload-hongloumeng.js
// Reads the local novel file and posts it to the backend api to kick off indexing.

const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(__dirname, "..", "hongloumeng.txt");
const apiUrl = "http://localhost:3000/api/knowledge/documents";

async function main() {
  console.log(`Reading file: ${filePath}`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`File does not exist: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, "utf-8");
  console.log(`File size: ${content.length} characters.`);

  console.log(`Sending POST request to ${apiUrl}...`);
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "红楼梦",
      fileName: "hongloumeng.txt",
      content: content,
    }),
  });

  const responseText = await response.text();
  console.log(`Response Status: ${response.status}`);
  
  let json;
  try {
    json = JSON.parse(responseText);
  } catch {
    console.log("Raw Response:", responseText);
    process.exit(1);
  }

  if (response.ok && json.success) {
    console.log("✔ Novel uploaded successfully!");
    console.log("Document details:", json.data);
    process.exit(0);
  } else {
    console.error("Failed to upload novel:", json);
    process.exit(1);
  }
}

main().catch(console.error);
