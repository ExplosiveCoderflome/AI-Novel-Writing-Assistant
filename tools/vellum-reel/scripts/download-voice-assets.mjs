import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {readJson, resolveArg, root} from './_shared.mjs';

const manifestFile = resolveArg('manifest', 'voice-assets.json');
const manifest = await readJson(manifestFile);

for (const asset of manifest.assets) {
  const output = path.resolve(root, 'public', asset.output);
  await mkdir(path.dirname(output), {recursive: true});
  const response = await fetch(asset.url);
  if (!response.ok) throw new Error(`${asset.id} 下载失败：HTTP ${response.status}`);
  await writeFile(output, Buffer.from(await response.arrayBuffer()));
  console.log(`✓ ${asset.id} -> ${asset.output}`);
}
