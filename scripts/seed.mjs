// Drops the sample overnight inbox into var/inbox, where the running agent picks it up.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../core/config.mjs';

const items = JSON.parse(readFileSync(join(config.dataDir, 'inbox-seed.json'), 'utf8'));
const dir = join(config.varDir, 'inbox');
mkdirSync(dir, { recursive: true });
items.forEach((m, i) => writeFileSync(join(dir, `seed-${String(i).padStart(2, '0')}.json`), JSON.stringify(m, null, 2)));
console.log(`Dropped ${items.length} emails into ${dir}. The running agent picks them up on its next tick.`);
