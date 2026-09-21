import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import semver from 'semver';

const root = process.cwd();
const packagePath = path.join(root, 'package.json');
const changelogPath = path.join(root, 'CHANGELOG.md');

/** @typedef {{ [key: string]: unknown, version: string }} PackageJson */

/**
 * @param {{ packageJson: PackageJson, changelog: string, version: string, date?: string }} input
 */
export function prepareRelease({ packageJson, changelog, version, date }) {
	if (
		!version ||
		version.startsWith('v') ||
		!semver.valid(version) ||
		version.includes('+')
	) {
		throw new Error(`invalid release version: ${version || '(empty)'}`);
	}

	const currentVersion = semver.clean(packageJson.version);
	if (!currentVersion || !semver.gt(version, currentVersion)) {
		throw new Error(
			`release version must be greater than package.json version (${packageJson.version})`,
		);
	}

	const unreleasedHeading = /^## \[Unreleased\][ \t]*(?:\r?\n|$)/m.exec(
		changelog,
	);
	if (!unreleasedHeading) {
		throw new Error('CHANGELOG.md must contain an [Unreleased] section');
	}

	const sectionStart = unreleasedHeading.index;
	const contentStart = sectionStart + unreleasedHeading[0].length;
	const nextHeadingPattern = /^## \[/gm;
	nextHeadingPattern.lastIndex = contentStart;
	const nextHeading = nextHeadingPattern.exec(changelog);
	const sectionEnd = nextHeading?.index ?? changelog.length;
	const changes = changelog.slice(contentStart, sectionEnd).trim();
	if (
		!changes ||
		!/^### (Added|Changed|Deprecated|Removed|Fixed|Security)\s*\n[\s\S]*?^-/m.test(
			changes,
		)
	) {
		throw new Error('[Unreleased] must contain at least one change');
	}

	const releaseHeading = new RegExp(
		`^## \\[${semver.clean(version)}\\]`,
		'm',
	);
	if (releaseHeading.test(changelog)) {
		throw new Error(`CHANGELOG.md already contains version ${version}`);
	}

	const releaseDate = date ?? new Date().toISOString().slice(0, 10);
	const replacement = `## [Unreleased]\n\n## [${version}] - ${releaseDate}\n\n${changes}\n`;
	const updatedChangelog = [
		changelog.slice(0, sectionStart),
		replacement,
		changelog.slice(sectionEnd),
	].join('');

	return {
		packageJson: { ...packageJson, version },
		changelog: updatedChangelog,
	};
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const version = process.argv[2];
	if (!version) {
		console.error('usage: node scripts/prepare-release.mjs VERSION');
		process.exit(64);
	}

	try {
		/** @type {PackageJson} */
		const packageJson = JSON.parse(await fs.readFile(packagePath, 'utf8'));
		const changelog = await fs.readFile(changelogPath, 'utf8');
		const result = prepareRelease({
			packageJson,
			changelog,
			version,
			date: process.env.RELEASE_DATE,
		});
		await fs.writeFile(
			packagePath,
			`${JSON.stringify(result.packageJson, null, '\t')}\n`,
		);
		await fs.writeFile(changelogPath, result.changelog);
		console.log(`prepared release ${version}`);
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exit(1);
	}
}
