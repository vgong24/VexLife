#!/usr/bin/env node
import fs from 'node:fs';
import { buildBlueprintImpact } from '../src/core/impact.mjs';
const args = process.argv.slice(2);
const value = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : null; };
const beforePath = value('--before'); const afterPath = value('--after');
if (!beforePath || !afterPath) { console.error('Required: --before <blueprint.json> --after <blueprint.json>'); process.exit(2); }
const before = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
const after = JSON.parse(fs.readFileSync(afterPath, 'utf8'));
console.log(JSON.stringify(buildBlueprintImpact(before, after), null, 2));
// [VXG RealForever]
