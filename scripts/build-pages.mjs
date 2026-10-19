import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
// Publish only game files, never repository settings, notes or development tools.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const entry of ['index.html', 'manifest.json', 'sw.js', 'css', 'js', 'assets']) {
  await cp(new URL(entry, root), new URL(entry, output), { recursive: true });
}
await writeFile(new URL('.nojekyll', output), '');
const manifest = JSON.parse(await readFile(new URL('manifest.json', output), 'utf8'));
if (manifest.start_url !== './' || manifest.scope !== './') {
  throw new Error('The manifest must remain relative for GitHub project Pages.');
}
console.log(`GitHub Pages artifact ready: ${fileURLToPath(output)}`);
