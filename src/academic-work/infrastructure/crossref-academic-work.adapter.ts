import { Injectable } from '@nestjs/common';

import {
	AcademicWorkSourceError,
	type AcademicWorkCandidate,
	type AcademicWorkPage,
	type AcademicWorkQuery,
	type AcademicWorkSourcePort,
} from '../application/academic-work-source.port.js';

const CROSSREF_URL = 'https://api.crossref.org';
const TIMEOUT_MS = 10_000;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1_000;

function record(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function nonempty(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function firstString(value: unknown): string | undefined {
	return Array.isArray(value) ? nonempty(value[0]) : undefined;
}

function plainText(value: unknown): string | undefined {
	const raw = nonempty(value);
	if (!raw) return undefined;
	const text = raw
		.replace(/<[^>]*>/g, ' ')
		.replace(/&#(x[\da-f]+|\d+);/gi, (_match, entity: string) => {
			const radix = entity[0]?.toLowerCase() === 'x' ? 16 : 10;
			const number = Number.parseInt(
				radix === 16 ? entity.slice(1) : entity,
				radix,
			);
			return Number.isInteger(number) && number >= 0 && number <= 0x10ffff
				? String.fromCodePoint(number)
				: ' ';
		})
		.replace(/&(?:amp|lt|gt|quot|apos|nbsp);/gi, (entity) => {
			const names: Record<string, string> = {
				'&amp;': '&',
				'&lt;': '<',
				'&gt;': '>',
				'&quot;': '"',
				'&apos;': "'",
				'&nbsp;': ' ',
			};
			return names[entity.toLowerCase()] ?? entity;
		})
		.replace(/\s+/g, ' ')
		.trim();
	return text || undefined;
}

function publicationDate(item: Record<string, unknown>): string | undefined {
	for (const key of [
		'published',
		'published-online',
		'published-print',
		'issued',
	]) {
		const parts = record(item[key])?.['date-parts'];
		if (!Array.isArray(parts) || !Array.isArray(parts[0])) continue;
		const [year, month, day] = parts[0] as number[];
		if (!Number.isInteger(year) || year < 1) continue;
		if (
			month !== undefined &&
			(!Number.isInteger(month) || month < 1 || month > 12)
		)
			continue;
		if (
			day !== undefined &&
			(!Number.isInteger(day) || day < 1 || day > 31)
		)
			continue;
		return [year, month, day]
			.filter((part) => part !== undefined)
			.map((part, index) =>
				index === 0
					? String(part).padStart(4, '0')
					: String(part).padStart(2, '0'),
			)
			.join('-');
	}
	return undefined;
}

function httpUrl(value: unknown): string | undefined {
	const raw = nonempty(value);
	if (!raw) return undefined;
	try {
		const url = new URL(raw);
		return url.protocol === 'https:' || url.protocol === 'http:'
			? url.href
			: undefined;
	} catch {
		return undefined;
	}
}

function normalize(item: unknown): AcademicWorkCandidate | undefined {
	const work = record(item);
	if (!work) return undefined;
	const doi = nonempty(work.DOI)
		?.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
		.toLowerCase();
	const title = plainText(firstString(work.title));
	if (!doi || !title) return undefined;

	const authors = Array.isArray(work.author)
		? work.author
				.map((entry) => {
					const author = record(entry);
					if (!author) return undefined;
					return (
						nonempty(
							[nonempty(author.given), nonempty(author.family)]
								.filter(Boolean)
								.join(' '),
						) ?? nonempty(author.name)
					);
				})
				.filter((author): author is string => Boolean(author))
		: [];

	const abstract = plainText(work.abstract);
	return {
		externalId: doi,
		title,
		authors,
		...(abstract ? { abstract } : {}),
		...(publicationDate(work)
			? { publicationDate: publicationDate(work) }
			: {}),
		...(plainText(firstString(work['container-title']))
			? { journal: plainText(firstString(work['container-title'])) }
			: {}),
		...(httpUrl(work.URL) ? { url: httpUrl(work.URL) } : {}),
	};
}

function validateQuery(query: AcademicWorkQuery): {
	issn: string;
	limit: number;
} {
	const issn = query.sourceIdentifier.replace('-', '').toUpperCase();
	if (!/^\d{7}[\dX]$/.test(issn)) {
		throw new RangeError('sourceIdentifier must be an ISSN.');
	}
	for (const date of [query.fromDate, query.untilDate]) {
		if (date !== undefined && !/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(date)) {
			throw new RangeError('Publication dates must use ISO format.');
		}
	}
	if (query.fromDate && query.untilDate && query.fromDate > query.untilDate) {
		throw new RangeError('fromDate must not be after untilDate.');
	}
	const limit = query.limit ?? DEFAULT_LIMIT;
	if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
		throw new RangeError('limit must be between 1 and 1000.');
	}
	return { issn, limit };
}

@Injectable()
export class CrossrefAcademicWorkAdapter implements AcademicWorkSourcePort {
	constructor(private readonly fetchImpl: typeof fetch = fetch) {}

	async search(query: AcademicWorkQuery): Promise<AcademicWorkPage> {
		const { issn, limit } = validateQuery(query);
		const url = new URL('/journals/' + issn + '/works', CROSSREF_URL);
		const filters = [
			'type:' + (query.publicationType ?? 'journal-article'),
		];
		if (query.fromDate) filters.push('from-pub-date:' + query.fromDate);
		if (query.untilDate) filters.push('until-pub-date:' + query.untilDate);
		if (query.requireAbstract) filters.push('has-abstract:true');
		url.searchParams.set('filter', filters.join(','));
		url.searchParams.set('rows', String(limit));
		url.searchParams.set('cursor', query.cursor ?? '*');
		url.searchParams.set(
			'select',
			'DOI,title,author,abstract,published,published-online,published-print,issued,container-title,URL',
		);

		let response: Response;
		try {
			response = await this.fetchImpl(url, {
				headers: { Accept: 'application/json' },
				signal: AbortSignal.timeout(TIMEOUT_MS),
			});
		} catch (error) {
			if (
				error instanceof Error &&
				(error.name === 'TimeoutError' || error.name === 'AbortError')
			) {
				throw new AcademicWorkSourceError('timeout');
			}
			throw new AcademicWorkSourceError('unavailable');
		}

		if (!response.ok) throw new AcademicWorkSourceError('unavailable');

		let payload: unknown;
		try {
			payload = await response.json();
		} catch {
			throw new AcademicWorkSourceError('invalid-response');
		}
		const message = record(record(payload)?.message);
		if (!message || !Array.isArray(message.items)) {
			throw new AcademicWorkSourceError('invalid-response');
		}
		const items = message.items
			.map(normalize)
			.filter((item): item is AcademicWorkCandidate => Boolean(item))
			.filter((item) => !query.requireAbstract || Boolean(item.abstract));
		const nextCursor = nonempty(message['next-cursor']);
		return {
			items,
			...(message.items.length === limit &&
			nextCursor &&
			nextCursor !== query.cursor
				? { nextCursor }
				: {}),
		};
	}
}
