import {readFile, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';

export const root = process.cwd();

export const readJson = async (file) => JSON.parse(await readFile(path.resolve(root, file), 'utf8'));

export const writeJson = async (file, value) => {
  const output = path.resolve(root, file);
  await mkdir(path.dirname(output), {recursive: true});
  await writeFile(output, `${JSON.stringify(value, null, 2)}\n`);
};

export const publicPath = (relativePath) => path.resolve(root, 'public', relativePath);

export const cleanText = (text) => text.replace(/\s+/g, '').trim();

export const splitChineseText = (paragraphs, maxChars = 18) => {
  const chunks = [];

  for (const paragraph of paragraphs) {
    const sentences = paragraph
      .split(/(?<=[。！？；])/u)
      .map(cleanText)
      .filter(Boolean);

    for (const sentence of sentences) {
      if (sentence.length <= maxChars) {
        chunks.push(sentence.replace(/[。！？；]$/u, ''));
        continue;
      }

      const clauses = sentence
        .split(/(?<=[，、：；])/u)
        .map(cleanText)
        .filter(Boolean);
      let pending = '';

      for (const clause of clauses) {
        const normalized = clause.replace(/[，、：；。！？]$/u, '');
        if (!pending) {
          pending = normalized;
        } else if ((pending + normalized).length <= maxChars) {
          pending += normalized;
        } else {
          chunks.push(pending);
          pending = normalized;
        }

        while (pending.length > maxChars) {
          chunks.push(pending.slice(0, maxChars));
          pending = pending.slice(maxChars);
        }
      }

      if (pending) chunks.push(pending);
    }
  }

  return chunks;
};

export const resolveArg = (name, fallback) => {
  const prefix = `--${name}=`;
  const entry = process.argv.find((arg) => arg.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : fallback;
};
