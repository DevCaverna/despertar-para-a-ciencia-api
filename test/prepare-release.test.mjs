import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { prepareRelease } from '../scripts/prepare-release.mjs';

const script = fileURLToPath(
	new URL('../scripts/prepare-release.mjs', import.meta.url),
);
const basePackage = {
	name: 'despertar-para-a-ciencia-api',
	version: '1.0.0',
	private: true,
};
const baseChangelog = `# Changelog\n\n## [Unreleased]\n\n### Fixed\n\n- Fix a bug.\n\n## [0.9.0] - 2026-01-01\n\n### Added\n\n- Old feature.\n`;

void test('prepares a release and preserves previous releases', () => {
	const result = prepareRelease({
		packageJson: basePackage,
		changelog: baseChangelog,
		version: '1.1.0',
		date: '2026-09-10',
	});

	assert.equal(result.packageJson.version, '1.1.0');
	assert.match(
		result.changelog,
		/## \[Unreleased\]\n\n## \[1\.1\.0\] - 2026-09-10/,
	);
	assert.match(result.changelog, /## \[0\.9\.0\] - 2026-01-01/);
});

void test('prepares the first release when Unreleased is the only section', async () => {
	const directory = await fs.mkdtemp(
		path.join(os.tmpdir(), 'prepare-first-release-'),
	);
	const packageJson = {
		name: 'despertar-para-a-ciencia-api',
		version: '0.0.1',
		private: true,
	};
	const changelog =
		'# Changelog\n\n## [Unreleased]\n\n### Added\n\n- First feature.\n';
	await fs.writeFile(
		path.join(directory, 'package.json'),
		`${JSON.stringify(packageJson, null, '\t')}\n`,
	);
	await fs.writeFile(path.join(directory, 'CHANGELOG.md'), changelog);

	await new Promise((resolve, reject) => {
		execFile(
			process.execPath,
			[script, '0.1.0'],
			{
				cwd: directory,
				env: { ...process.env, RELEASE_DATE: '2026-09-10' },
			},
			(error) => (error ? reject(error) : resolve()),
		);
	});

	const updatedPackage = JSON.parse(
		String(await fs.readFile(path.join(directory, 'package.json'), 'utf8')),
	);
	const updatedChangelog = await fs.readFile(
		path.join(directory, 'CHANGELOG.md'),
		'utf8',
	);
	assert.equal(updatedPackage.version, '0.1.0');
	assert.match(
		updatedChangelog,
		/## \[Unreleased\]\n\n## \[0\.1\.0\] - 2026-09-10/,
	);
	assert.match(updatedChangelog, /- First feature\./);
	assert.doesNotMatch(updatedChangelog, /__end__/);
});

for (const version of [
	'',
	'v1.1.0',
	'not-semver',
	'1.0.0',
	'0.9.0',
	'1.1.0+build',
]) {
	void test(`rejects invalid version ${version || '(empty)'}`, () => {
		assert.throws(() =>
			prepareRelease({
				packageJson: basePackage,
				changelog: baseChangelog,
				version,
			}),
		);
	});
}

void test('accepts a prerelease greater than the current version', () => {
	const result = prepareRelease({
		packageJson: basePackage,
		changelog: baseChangelog,
		version: '2.0.0-rc.1',
		date: '2026-09-10',
	});
	assert.match(result.changelog, /## \[2\.0\.0-rc\.1\] - 2026-09-10/);
});

void test('rejects missing or empty Unreleased sections and duplicate releases', () => {
	assert.throws(() =>
		prepareRelease({
			packageJson: basePackage,
			changelog: '# Changelog\n',
			version: '1.1.0',
		}),
	);
	assert.throws(() =>
		prepareRelease({
			packageJson: basePackage,
			changelog: '# Changelog\n\n## [Unreleased]\n',
			version: '1.1.0',
		}),
	);
	assert.throws(() =>
		prepareRelease({
			packageJson: basePackage,
			changelog: `${baseChangelog}\n## [1.1.0] - 2026-01-01\n`,
			version: '1.1.0',
		}),
	);
});

void test('does not alter files when validation fails', async () => {
	const directory = await fs.mkdtemp(
		path.join(os.tmpdir(), 'prepare-release-'),
	);
	await fs.writeFile(
		path.join(directory, 'package.json'),
		`${JSON.stringify(basePackage)}\n`,
	);
	await fs.writeFile(path.join(directory, 'CHANGELOG.md'), baseChangelog);
	const failed = await new Promise((resolve) => {
		execFile(
			process.execPath,
			[script, '1.0.0'],
			{ cwd: directory },
			(error) => resolve(Boolean(error)),
		);
	});
	assert.equal(failed, true);
	assert.equal(
		await fs.readFile(path.join(directory, 'package.json'), 'utf8'),
		`${JSON.stringify(basePackage)}\n`,
	);
	assert.equal(
		await fs.readFile(path.join(directory, 'CHANGELOG.md'), 'utf8'),
		baseChangelog,
	);
});
