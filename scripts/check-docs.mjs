// oxlint-disable typescript/no-unsafe-argument
// Node's promise fs overloads are not narrowed in this JavaScript file.
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const docsRoot = path.join(root, 'docs');
const rootDocuments = [
	path.join(root, 'README.md'),
	path.join(root, 'CONTRIBUTING.md'),
	path.join(root, 'AGENTS.md'),
	path.join(root, 'CHANGELOG.md'),
];
const allowedDirectories = new Set([
	'arquitetura',
	'desenvolvimento',
	'entrega',
	'operacao',
	'decisoes',
	'rfcs',
]);
const markdownFileName = /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;

async function collectMarkdownFiles(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = await Promise.all(
		entries.map((entry) => {
			const entryPath = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				return collectMarkdownFiles(entryPath);
			}
			return entry.isFile() && entry.name.endsWith('.md')
				? [entryPath]
				: [];
		}),
	);

	return files.flat();
}

function fail(message) {
	console.error(`docs:check: ${message}`);
	process.exitCode = 1;
}

function proseLines(content) {
	const lines = [];
	let fence;

	for (const line of content.split(/\r?\n/)) {
		const marker = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
		if (!fence && marker) {
			fence = marker;
			continue;
		}
		if (fence) {
			const closingFence = new RegExp(
				`^\\s*${fence[0]}{${fence.length},}\\s*$`,
			);
			if (closingFence.test(line)) fence = undefined;
			continue;
		}
		lines.push(line);
	}

	return lines;
}

function localLinks(lines) {
	const links = [];
	const pattern = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)/g;

	for (const match of lines.join('\n').matchAll(pattern)) {
		const target = match[1];
		if (!target) continue;
		if (
			target.startsWith('#') ||
			target.startsWith('http://') ||
			target.startsWith('https://') ||
			target.startsWith('mailto:')
		) {
			continue;
		}
		links.push(target.split('#', 1)[0]);
	}

	return links;
}

async function exists(target) {
	try {
		await access(target);
		return true;
	} catch {
		return false;
	}
}

const docsFiles = await collectMarkdownFiles(docsRoot);
const files = [...rootDocuments, ...docsFiles];
const reachable = new Set([path.join(docsRoot, 'README.md')]);
const pending = [path.join(docsRoot, 'README.md')];

await Promise.all(
	files.map(async (file) => {
		const relativePath = path.relative(root, file);
		const docsRelativePath = path.relative(docsRoot, file);
		const parts = docsRelativePath.split(path.sep);
		const name = parts.at(-1);

		if (
			file.startsWith(`${docsRoot}${path.sep}`) &&
			docsRelativePath !== 'README.md'
		) {
			if (parts.length !== 2 || !allowedDirectories.has(parts[0])) {
				fail(`${relativePath} está fora de um diretório permitido`);
			}
			if (!markdownFileName.test(name)) {
				fail(`${relativePath} não usa lowercase ASCII em kebab-case`);
			}
		}

		const content = await readFile(file, 'utf8');
		const lines = proseLines(content);
		const firstSignificant = lines.find((line) => line.trim() !== '');
		const h1s = lines.filter((line) => /^#(?!#)\s+\S/.test(line));
		if (!firstSignificant?.match(/^#(?!#)\s+\S/)) {
			fail(`${relativePath} não começa com um H1`);
		}
		if (h1s.length !== 1) {
			fail(`${relativePath} deve possuir exatamente um H1`);
		}

		const links = localLinks(lines);
		const validLinks = await Promise.all(
			links.map((link) => exists(path.resolve(path.dirname(file), link))),
		);
		for (const [index, link] of links.entries()) {
			if (!validLinks[index]) {
				fail(
					`${relativePath} aponta para destino inexistente: ${link}`,
				);
			}
		}
	}),
);

while (pending.length > 0) {
	const batch = pending.splice(0);
	// Breadth-first traversal requires one read batch before the next frontier.
	// oxlint-disable-next-line no-await-in-loop
	const discovered = await Promise.all(
		batch.map(async (file) => {
			const content = await readFile(file, 'utf8');
			return localLinks(proseLines(content))
				.map((link) => path.resolve(path.dirname(file), link))
				.filter(
					(target) =>
						target.startsWith(`${docsRoot}${path.sep}`) &&
						target.endsWith('.md'),
				);
		}),
	);
	for (const target of discovered.flat()) {
		if (
			!target.startsWith(`${docsRoot}${path.sep}`) ||
			!target.endsWith('.md')
		) {
			continue;
		}
		if (!reachable.has(target)) {
			reachable.add(target);
			pending.push(target);
		}
	}
}

await Promise.all(
	docsFiles.map((file) => {
		if (!reachable.has(file)) {
			fail(
				`${path.relative(docsRoot, file)} não é alcançável a partir de docs/README.md`,
			);
		}
	}),
);
