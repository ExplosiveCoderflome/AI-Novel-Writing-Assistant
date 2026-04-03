const TEXT_FILE_ENCODING_CANDIDATES = ["utf-8", "gb18030", "gbk", "big5", "utf-16le", "utf-16be"] as const;
const SUSPICIOUS_MOJIBAKE_TOKENS = ["銆€", "锛", "鏈功", "涓€", "鍥犱负"] as const;

function detectTxtBomEncoding(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return "utf-8";
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return "utf-16le";
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return "utf-16be";
  }
  return null;
}

function countOccurrences(text: string, token: string): number {
  if (!token) {
    return 0;
  }
  let total = 0;
  let cursor = 0;
  while (true) {
    const index = text.indexOf(token, cursor);
    if (index < 0) {
      return total;
    }
    total += 1;
    cursor = index + token.length;
  }
}

function scoreDecodedTxt(text: string): number {
  if (!text.trim()) {
    return Number.NEGATIVE_INFINITY;
  }
  const nonWhitespace = text.match(/\S/g)?.length ?? 0;
  const cjkChars = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const replacementChars = text.match(/\uFFFD/g)?.length ?? 0;
  const controlChars = text.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g)?.length ?? 0;
  const privateUseChars = text.match(/[\uE000-\uF8FF]/g)?.length ?? 0;
  const mojibakeChars = text.match(/[鑴欒剹闄囧▌鎼傜瘬鍗על┐闄哴]/g)?.length ?? 0;
  const suspiciousTokenCount = SUSPICIOUS_MOJIBAKE_TOKENS.reduce(
    (total, token) => total + countOccurrences(text, token),
    0,
  );

  return nonWhitespace
    + cjkChars * 2
    - replacementChars * 12
    - controlChars * 6
    - privateUseChars * 20
    - mojibakeChars * 4
    - suspiciousTokenCount * 8;
}

function isValidUtf8(bytes: Uint8Array): boolean {
  for (let index = 0; index < bytes.length; index += 1) {
    const byte1 = bytes[index];

    if (byte1 <= 0x7f) {
      continue;
    }

    if (byte1 >= 0xc2 && byte1 <= 0xdf) {
      const byte2 = bytes[index + 1];
      if (byte2 === undefined || (byte2 & 0xc0) !== 0x80) {
        return false;
      }
      index += 1;
      continue;
    }

    if (byte1 === 0xe0) {
      const byte2 = bytes[index + 1];
      const byte3 = bytes[index + 2];
      if (
        byte2 === undefined
        || byte3 === undefined
        || byte2 < 0xa0
        || byte2 > 0xbf
        || (byte3 & 0xc0) !== 0x80
      ) {
        return false;
      }
      index += 2;
      continue;
    }

    if ((byte1 >= 0xe1 && byte1 <= 0xec) || (byte1 >= 0xee && byte1 <= 0xef)) {
      const byte2 = bytes[index + 1];
      const byte3 = bytes[index + 2];
      if (
        byte2 === undefined
        || byte3 === undefined
        || (byte2 & 0xc0) !== 0x80
        || (byte3 & 0xc0) !== 0x80
      ) {
        return false;
      }
      index += 2;
      continue;
    }

    if (byte1 === 0xed) {
      const byte2 = bytes[index + 1];
      const byte3 = bytes[index + 2];
      if (
        byte2 === undefined
        || byte3 === undefined
        || byte2 < 0x80
        || byte2 > 0x9f
        || (byte3 & 0xc0) !== 0x80
      ) {
        return false;
      }
      index += 2;
      continue;
    }

    if (byte1 === 0xf0) {
      const byte2 = bytes[index + 1];
      const byte3 = bytes[index + 2];
      const byte4 = bytes[index + 3];
      if (
        byte2 === undefined
        || byte3 === undefined
        || byte4 === undefined
        || byte2 < 0x90
        || byte2 > 0xbf
        || (byte3 & 0xc0) !== 0x80
        || (byte4 & 0xc0) !== 0x80
      ) {
        return false;
      }
      index += 3;
      continue;
    }

    if (byte1 >= 0xf1 && byte1 <= 0xf3) {
      const byte2 = bytes[index + 1];
      const byte3 = bytes[index + 2];
      const byte4 = bytes[index + 3];
      if (
        byte2 === undefined
        || byte3 === undefined
        || byte4 === undefined
        || (byte2 & 0xc0) !== 0x80
        || (byte3 & 0xc0) !== 0x80
        || (byte4 & 0xc0) !== 0x80
      ) {
        return false;
      }
      index += 3;
      continue;
    }

    if (byte1 === 0xf4) {
      const byte2 = bytes[index + 1];
      const byte3 = bytes[index + 2];
      const byte4 = bytes[index + 3];
      if (
        byte2 === undefined
        || byte3 === undefined
        || byte4 === undefined
        || byte2 < 0x80
        || byte2 > 0x8f
        || (byte3 & 0xc0) !== 0x80
        || (byte4 & 0xc0) !== 0x80
      ) {
        return false;
      }
      index += 3;
      continue;
    }

    return false;
  }

  return true;
}

export async function readTextFile(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const bomEncoding = detectTxtBomEncoding(bytes);
  const shouldPreferUtf8 = !bomEncoding && isValidUtf8(bytes);
  const encodings = bomEncoding
    ? [bomEncoding, ...TEXT_FILE_ENCODING_CANDIDATES.filter((encoding) => encoding !== bomEncoding)]
    : shouldPreferUtf8
      ? ["utf-8", ...TEXT_FILE_ENCODING_CANDIDATES.filter((encoding) => encoding !== "utf-8")]
      : [...TEXT_FILE_ENCODING_CANDIDATES];

  let bestDecoded = "";
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const encoding of encodings) {
    try {
      const decoded = new TextDecoder(encoding).decode(bytes);
      const score = scoreDecodedTxt(decoded) + (shouldPreferUtf8 && encoding === "utf-8" ? 12 : 0);
      if (score > bestScore) {
        bestDecoded = decoded;
        bestScore = score;
      }
    } catch {
      // Browser TextDecoder support varies by encoding.
    }
  }

  return bestDecoded.replace(/\u0000/g, "").trim();
}

export function isTxtFile(file: File): boolean {
  return file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt");
}
