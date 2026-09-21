import fs from 'node:fs/promises';

const version = process.argv[2];
if (!version) {
	console.error('usage: node scripts/extract-release-notes.mjs VERSION');
	process.exit(64);
}

const changelog = await fs.readFile('CHANGELOG.md', 'utf8');
const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const match = new RegExp(
	`^## \\[${escaped}\\].*\\n([\\s\\S]*?)(?=^## \\[)`,
	'm',
).exec(`${changelog}\n## [__end__]`);
if (!match) {
	console.error(`release notes not found for ${version}`);
	process.exit(1);
}
process.stdout.write(match[1].trim() + '\n');
