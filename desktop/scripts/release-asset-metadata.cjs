const crypto = require("node:crypto");
const fs = require("node:fs");

class ReleaseAssetContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ReleaseAssetContractError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new ReleaseAssetContractError(code, message);
}

function parseYamlScalar(source, fileName, lineNumber) {
  const value = source.trim();
  if (!value || value === "null" || value === "~") {
    return "";
  }
  if (value.startsWith("\"") || value.endsWith("\"")) {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed !== "string") {
        fail("INVALID_UPDATE_METADATA", `${fileName}:${lineNumber} must contain a string scalar.`);
      }
      return parsed;
    } catch (error) {
      if (error instanceof ReleaseAssetContractError) {
        throw error;
      }
      fail("INVALID_UPDATE_METADATA", `${fileName}:${lineNumber} contains an invalid quoted scalar.`);
    }
  }
  if (value.startsWith("'") || value.endsWith("'")) {
    if (!(value.startsWith("'") && value.endsWith("'"))) {
      fail("INVALID_UPDATE_METADATA", `${fileName}:${lineNumber} contains an invalid quoted scalar.`);
    }
    return value.slice(1, -1).replace(/''/g, "'");
  }
  if (/^[>|&*!]/.test(value)) {
    fail("UNSUPPORTED_UPDATE_METADATA", `${fileName}:${lineNumber} uses unsupported YAML features.`);
  }
  return value;
}

function assignYamlValue(target, key, value, fileName, lineNumber) {
  if (Object.prototype.hasOwnProperty.call(target, key)) {
    fail("DUPLICATE_UPDATE_METADATA_KEY", `${fileName}:${lineNumber} repeats key ${key}.`);
  }
  target[key] = value;
}

function parseUpdateMetadata(source, fileName) {
  const metadata = { files: [] };
  let inFiles = false;
  let currentFile = null;
  const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const lineNumber = index + 1;
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#") || rawLine.trim() === "---") {
      continue;
    }
    if (rawLine.includes("\t")) {
      fail("INVALID_UPDATE_METADATA", `${fileName}:${lineNumber} must use spaces for YAML indentation.`);
    }
    const indentation = rawLine.length - rawLine.trimStart().length;
    const trimmed = rawLine.trim();

    if (indentation === 0) {
      currentFile = null;
      const match = /^([A-Za-z][A-Za-z0-9_-]*):(?:\s*(.*))?$/.exec(trimmed);
      if (!match) {
        fail("INVALID_UPDATE_METADATA", `${fileName}:${lineNumber} is not a supported top-level mapping.`);
      }
      const [, key, scalarSource = ""] = match;
      if (key === "files") {
        if (scalarSource.trim()) {
          fail("INVALID_UPDATE_METADATA", `${fileName}:${lineNumber} files must be a YAML list.`);
        }
        inFiles = true;
        continue;
      }
      inFiles = false;
      assignYamlValue(metadata, key, parseYamlScalar(scalarSource, fileName, lineNumber), fileName, lineNumber);
      continue;
    }

    if (!inFiles) {
      fail("UNSUPPORTED_UPDATE_METADATA", `${fileName}:${lineNumber} contains an unsupported nested mapping.`);
    }
    const listMatch = /^-\s+([A-Za-z][A-Za-z0-9_-]*):(?:\s*(.*))?$/.exec(trimmed);
    if (listMatch) {
      currentFile = {};
      metadata.files.push(currentFile);
      assignYamlValue(
        currentFile,
        listMatch[1],
        parseYamlScalar(listMatch[2] || "", fileName, lineNumber),
        fileName,
        lineNumber,
      );
      continue;
    }
    const fieldMatch = /^([A-Za-z][A-Za-z0-9_-]*):(?:\s*(.*))?$/.exec(trimmed);
    if (!fieldMatch || !currentFile) {
      fail("INVALID_UPDATE_METADATA", `${fileName}:${lineNumber} is not a supported files entry.`);
    }
    assignYamlValue(
      currentFile,
      fieldMatch[1],
      parseYamlScalar(fieldMatch[2] || "", fileName, lineNumber),
      fileName,
      lineNumber,
    );
  }
  return metadata;
}

function decodeMetadataAssetName(value, context, repository, tag) {
  if (typeof value !== "string" || !value.trim()) {
    fail("UPDATE_ASSET_URL_MISSING", `${context} must identify a release asset.`);
  }
  const source = value.trim();
  let encodedName;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(source)) {
    let parsedUrl;
    try {
      parsedUrl = new URL(source);
    } catch (_error) {
      fail("INVALID_UPDATE_ASSET_URL", `${context} is not a valid URL.`);
    }
    if (parsedUrl.protocol !== "https:" || parsedUrl.hostname.toLowerCase() !== "github.com") {
      fail("INVALID_UPDATE_ASSET_URL", `${context} must use an HTTPS github.com release URL.`);
    }
    if (parsedUrl.search || parsedUrl.hash) {
      fail("INVALID_UPDATE_ASSET_URL", `${context} must not contain a query or fragment.`);
    }
    const parts = parsedUrl.pathname.split("/").filter(Boolean);
    if (
      parts.length !== 6
      || parts[0] !== repository.owner
      || parts[1] !== repository.repo
      || parts[2] !== "releases"
      || parts[3] !== "download"
    ) {
      fail("UPDATE_REPOSITORY_MISMATCH", `${context} does not target ${repository.slug}.`);
    }
    let urlTag;
    try {
      urlTag = decodeURIComponent(parts[4]);
    } catch (_error) {
      fail("INVALID_UPDATE_ASSET_URL", `${context} contains invalid URL encoding.`);
    }
    if (urlTag !== tag) {
      fail("UPDATE_TAG_MISMATCH", `${context} does not target release tag ${tag}.`);
    }
    encodedName = parts[5];
  } else {
    if (source.includes("/") || source.includes("\\") || source.includes("?") || source.includes("#")) {
      fail("INVALID_UPDATE_ASSET_URL", `${context} must be a single relative asset filename.`);
    }
    encodedName = source;
  }

  let name;
  try {
    name = decodeURIComponent(encodedName);
  } catch (_error) {
    fail("INVALID_UPDATE_ASSET_URL", `${context} contains invalid URL encoding.`);
  }
  if (!name || name === "." || name === ".." || name.includes("/") || name.includes("\\")) {
    fail("INVALID_UPDATE_ASSET_URL", `${context} resolves outside the release asset namespace.`);
  }
  return name;
}

function normalizeSha512(value, context) {
  const source = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9+/]{86}==$/.test(source)) {
    fail("INVALID_SHA512", `${context} must be a canonical base64 SHA-512 digest.`);
  }
  const decoded = Buffer.from(source, "base64");
  if (decoded.length !== 64 || decoded.toString("base64") !== source) {
    fail("INVALID_SHA512", `${context} must be a canonical base64 SHA-512 digest.`);
  }
  return source;
}

function sha512File(filePath) {
  const digest = crypto.createHash("sha512");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  const descriptor = fs.openSync(filePath, "r");
  try {
    let bytesRead;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) {
        digest.update(buffer.subarray(0, bytesRead));
      }
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(descriptor);
  }
  return digest.digest("base64");
}

function buildReleaseDownloadUrl(repository, tag, assetName) {
  return `https://github.com/${repository.owner}/${repository.repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(assetName)}`;
}

function validateMetadataFile({ metadataFile, platform, parsedVersion, repository, artifactsByName }) {
  const metadata = parseUpdateMetadata(fs.readFileSync(metadataFile.absolutePath, "utf8"), metadataFile.name);
  const expectedChannel = parsedVersion.updateChannel;
  if (metadata.version !== parsedVersion.version) {
    fail("UPDATE_VERSION_MISMATCH", `${metadataFile.name} version must equal ${parsedVersion.version}.`);
  }
  if (metadata.channel && metadata.channel !== expectedChannel) {
    fail("UPDATE_CHANNEL_MISMATCH", `${metadataFile.name} channel must equal ${expectedChannel}.`);
  }
  if (metadata.provider && metadata.provider !== "github") {
    fail("UPDATE_PROVIDER_MISMATCH", `${metadataFile.name} provider must be github.`);
  }
  if ((metadata.owner || metadata.repo) && (metadata.owner !== repository.owner || metadata.repo !== repository.repo)) {
    fail("UPDATE_REPOSITORY_MISMATCH", `${metadataFile.name} owner/repo must equal ${repository.slug}.`);
  }
  if (metadata.releaseType && metadata.releaseType !== parsedVersion.releaseType) {
    fail("UPDATE_RELEASE_TYPE_MISMATCH", `${metadataFile.name} releaseType must equal ${parsedVersion.releaseType}.`);
  }
  if (!Array.isArray(metadata.files) || metadata.files.length === 0) {
    fail("UPDATE_FILES_MISSING", `${metadataFile.name} must contain at least one files entry.`);
  }

  const allowedKinds = platform === "win"
    ? new Set(["windows-nsis"])
    : new Set(["mac-dmg", "mac-zip"]);
  const requiredPathKind = platform === "win" ? "windows-nsis" : "mac-zip";
  const seenNames = new Set();
  const validatedEntries = [];

  for (let index = 0; index < metadata.files.length; index += 1) {
    const entry = metadata.files[index];
    const context = `${metadataFile.name} files[${index}]`;
    const assetName = decodeMetadataAssetName(entry.url, `${context}.url`, repository, parsedVersion.tag);
    if (seenNames.has(assetName)) {
      fail("DUPLICATE_UPDATE_ASSET", `${metadataFile.name} repeats update asset ${assetName}.`);
    }
    seenNames.add(assetName);
    const artifact = artifactsByName.get(assetName);
    if (!artifact || !allowedKinds.has(artifact.kind)) {
      fail("UPDATE_ASSET_MISSING", `${context}.url does not reference an allowed ${platform} artifact: ${assetName}.`);
    }
    const expectedSha512 = sha512File(artifact.absolutePath);
    const declaredSha512 = normalizeSha512(entry.sha512, `${context}.sha512`);
    if (declaredSha512 !== expectedSha512) {
      fail("UPDATE_SHA512_MISMATCH", `${context}.sha512 does not match ${assetName}.`);
    }
    if (entry.size) {
      const declaredSize = Number(entry.size);
      if (!Number.isSafeInteger(declaredSize) || declaredSize !== artifact.size) {
        fail("UPDATE_SIZE_MISMATCH", `${context}.size does not match ${assetName}.`);
      }
    }
    validatedEntries.push({
      assetName,
      sha512: declaredSha512,
      downloadUrl: buildReleaseDownloadUrl(repository, parsedVersion.tag, assetName),
    });
  }

  const pathAssetName = decodeMetadataAssetName(
    metadata.path,
    `${metadataFile.name} path`,
    repository,
    parsedVersion.tag,
  );
  const pathArtifact = artifactsByName.get(pathAssetName);
  if (!pathArtifact || pathArtifact.kind !== requiredPathKind || !seenNames.has(pathAssetName)) {
    fail("UPDATE_PATH_MISMATCH", `${metadataFile.name} path must reference its ${requiredPathKind} files entry.`);
  }
  const declaredTopLevelSha512 = normalizeSha512(metadata.sha512, `${metadataFile.name} sha512`);
  if (declaredTopLevelSha512 !== sha512File(pathArtifact.absolutePath)) {
    fail("UPDATE_SHA512_MISMATCH", `${metadataFile.name} top-level sha512 does not match ${pathAssetName}.`);
  }

  return {
    name: metadataFile.name,
    platform,
    channel: expectedChannel,
    primaryAsset: pathAssetName,
    sha512: declaredTopLevelSha512,
    downloadUrl: buildReleaseDownloadUrl(repository, parsedVersion.tag, metadataFile.name),
    files: validatedEntries,
  };
}

module.exports = {
  ReleaseAssetContractError,
  buildReleaseDownloadUrl,
  fail,
  parseUpdateMetadata,
  sha512File,
  validateMetadataFile,
};
