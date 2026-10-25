// Builds the in-browser demo at docs/app/ (served by GitHub Pages): the same dashboard,
// with the agent's rule engine running in the page instead of the Node server.
// Run after changing public/, core/rules.mjs, core/brief.mjs or data/.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'docs', 'app');
mkdirSync(out, { recursive: true });

for (const f of ['style.css', 'app.js', 'icon.svg']) copyFileSync(join(root, 'public', f), join(out, f));
for (const f of ['rules.mjs', 'brief.mjs']) copyFileSync(join(root, 'core', f), join(out, f));

const kbDir = join(root, 'data', 'kb');
const data = {
  customers: JSON.parse(readFileSync(join(root, 'data', 'customers.json'), 'utf8')),
  inbox: JSON.parse(readFileSync(join(root, 'data', 'inbox-seed.json'), 'utf8')),
  kb: readdirSync(kbDir).filter((f) => f.endsWith('.md')).map((f) => ({ id: f.replace('.md', ''), text: readFileSync(join(kbDir, f), 'utf8') })),
};
writeFileSync(join(out, 'data.js'), `export default ${JSON.stringify(data, null, 1)};\n`);

const html = readFileSync(join(root, 'public', 'index.html'), 'utf8')
  .replace('<title>Nightdesk</title>', '<title>Nightdesk · live demo</title>')
  .replace('<header class="top">', '<div class="demo-banner">Live demo in your browser: the agent’s rule engine runs on this page. The full agent runs on a local model (Ollama/vLLM) on your own machine. <a href="https://github.com/ParasAdlakha/nightdesk">Code</a> · <a href="../">Project page</a></div>\n<header class="top">')
  .replace('<link rel="stylesheet" href="style.css">', '<link rel="stylesheet" href="style.css">\n<style>.demo-banner{background:#8BCB2A;color:#10140C;padding:8px 20px;font-size:13px;font-weight:600}.demo-banner a{color:#10140C}.grid{height:calc(100vh - 100px)}</style>')
  .replace('<script src="app.js"></script>', '<script type="module" src="engine.js"></script>\n<script type="module" src="app.js"></script>');
writeFileSync(join(out, 'index.html'), html);
console.log('docs/app built');
