import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const i18nRoot = dirname(fileURLToPath(import.meta.url));
const referenceLanguage = 'pt-BR';

function languages(): string[] {
	return readdirSync(i18nRoot, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort();
}

function namespaces(language: string): string[] {
	return readdirSync(join(i18nRoot, language))
		.filter((file) => file.endsWith('.json'))
		.sort();
}

function flatten(value: unknown, prefix = ''): Map<string, string> {
	const entries = new Map<string, string>();

	if (typeof value === 'string') {
		entries.set(prefix, value);
		return entries;
	}

	for (const [key, child] of Object.entries(
		value as Record<string, unknown>,
	)) {
		const path = prefix ? `${prefix}.${key}` : key;
		for (const [childPath, text] of flatten(child, path)) {
			entries.set(childPath, text);
		}
	}

	return entries;
}

function load(language: string, namespace: string): Map<string, string> {
	const content: unknown = JSON.parse(
		readFileSync(join(i18nRoot, language, namespace), 'utf8'),
	);
	return flatten(content);
}

/** Nested keys (`$t(...)`) and interpolations (`{value}`) a translation must keep. */
function placeholders(text: string): string[] {
	return [...text.matchAll(/\$t\([^)]*\)|\{[^}]+\}/g)]
		.map(([match]) => match)
		.sort();
}

const translatedLanguages = languages().filter(
	(language) => language !== referenceLanguage,
);

describe('i18n translations', () => {
	it('ships English and Spanish besides pt-BR', () => {
		expect(translatedLanguages).toEqual(
			expect.arrayContaining(['en', 'es']),
		);
	});

	describe.each(translatedLanguages)('%s', (language) => {
		it('has the same namespace files as pt-BR', () => {
			expect(namespaces(language)).toEqual(namespaces(referenceLanguage));
		});

		it.each(namespaces(referenceLanguage))(
			'%s has the same keys and placeholders as pt-BR',
			(namespace) => {
				const reference = load(referenceLanguage, namespace);
				const translation = load(language, namespace);

				expect([...translation.keys()].sort()).toEqual(
					[...reference.keys()].sort(),
				);

				for (const [key, text] of reference) {
					expect(
						placeholders(translation.get(key) ?? ''),
						`${language}/${namespace} ${key}`,
					).toEqual(placeholders(text));
				}
			},
		);
	});
});
