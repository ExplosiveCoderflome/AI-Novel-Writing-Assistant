import fs from "node:fs";
import path from "node:path";

function isTipKey(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,99}$/.test(value);
}

export function createOnboardingTipStore(filePath: string) {
  const read = (): string[] => {
    let raw: string;
    try {
      raw = fs.readFileSync(filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const saved: unknown = JSON.parse(raw);
    if (!saved || typeof saved !== "object"
      || !("version" in saved) || saved.version !== 1
      || !("dismissed" in saved) || !Array.isArray(saved.dismissed)
      || !saved.dismissed.every(isTipKey)) {
      throw new Error("Invalid onboarding tip preferences.");
    }
    return [...new Set(saved.dismissed as string[])];
  };

  const dismiss = (key: unknown): string[] => {
    if (!isTipKey(key)) throw new Error("Invalid onboarding tip key.");
    const dismissed = read();
    if (dismissed.includes(key)) return dismissed;
    dismissed.push(key);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    // Finish the small write in the IPC handler before acknowledging the close.
    // Rename prevents an interrupted write from truncating the saved preferences.
    const temporaryPath = `${filePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify({ version: 1, dismissed }), "utf8");
    fs.renameSync(temporaryPath, filePath);
    return dismissed;
  };

  return { read, dismiss };
}
