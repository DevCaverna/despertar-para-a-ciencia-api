import { describe, expect, it, vi } from 'vitest';

import { CrossrefAcademicWorkAdapter } from './crossref-academic-work.adapter.js';

const work = {
	DOI: '10.1234/ABC',
	title: ['<i>Science &amp; society</i>'],
	author: [{ given: 'Ada', family: 'Lovelace' }, { name: 'Research Group' }],
	abstract: '<jats:p>Useful &#38; clear.</jats:p>',
	published: { 'date-parts': [[2025, 4, 2]] },
	'container-title': ['Journal of Science'],
	URL: 'https://doi.org/10.1234/ABC',
};

function response(items: unknown[], nextCursor = 'next'): Response {
	return {
		ok: true,
		json: vi.fn().mockResolvedValue({
			message: { items, 'next-cursor': nextCursor },
		}),
	} as unknown as Response;
}

describe('CrossrefAcademicWorkAdapter', () => {
	it('sends deterministic filters and normalizes one page', async () => {
		const fetcher = vi.fn().mockResolvedValue(response([work]));
		const adapter = new CrossrefAcademicWorkAdapter(fetcher);
		const page = await adapter.search({
			sourceIdentifier: '1234-567X',
			fromDate: '2025-01-01',
			untilDate: '2025-12-31',
			requireAbstract: true,
			limit: 1,
		});

		const url = new URL(fetcher.mock.calls[0]?.[0] as URL);
		expect(url.pathname).toBe('/journals/1234567X/works');
		expect(url.searchParams.get('filter')).toBe(
			'type:journal-article,from-pub-date:2025-01-01,until-pub-date:2025-12-31,has-abstract:true',
		);
		expect(url.searchParams.get('cursor')).toBe('*');
		expect(page).toEqual({
			items: [
				{
					externalId: '10.1234/abc',
					title: 'Science & society',
					authors: ['Ada Lovelace', 'Research Group'],
					abstract: 'Useful & clear.',
					publicationDate: '2025-04-02',
					journal: 'Journal of Science',
					url: 'https://doi.org/10.1234/ABC',
				},
			],
			nextCursor: 'next',
		});

		await adapter.search({
			sourceIdentifier: '1234-567X',
			cursor: page.nextCursor,
		});
		expect(
			new URL(fetcher.mock.calls[1]?.[0] as URL).searchParams.get(
				'cursor',
			),
		).toBe('next');
	});

	it('discards records without title or DOI and locally enforces required abstract', async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValue(
				response([
					work,
					{ ...work, DOI: undefined },
					{ ...work, title: [] },
					{ ...work, abstract: '<p> </p>' },
				]),
			);
		const adapter = new CrossrefAcademicWorkAdapter(fetcher);
		const page = await adapter.search({
			sourceIdentifier: '1234567X',
			requireAbstract: true,
		});
		expect(page.items).toHaveLength(1);
		expect(page.nextCursor).toBeUndefined();
	});

	it('accepts missing optional metadata and empty results', async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(
				response([{ DOI: '10.1/OK', title: ['A title'] }]),
			)
			.mockResolvedValueOnce(response([]));
		const adapter = new CrossrefAcademicWorkAdapter(fetcher);
		expect(
			(await adapter.search({ sourceIdentifier: '1234567X' })).items,
		).toEqual([{ externalId: '10.1/ok', title: 'A title', authors: [] }]);
		expect(await adapter.search({ sourceIdentifier: '1234567X' })).toEqual({
			items: [],
		});
	});

	it('translates transport, HTTP and malformed payload failures', async () => {
		const fetcher = vi
			.fn()
			.mockRejectedValueOnce(
				Object.assign(new Error('secret timeout'), {
					name: 'TimeoutError',
				}),
			)
			.mockResolvedValueOnce({ ok: false, status: 500 })
			.mockResolvedValueOnce({
				ok: true,
				json: vi.fn().mockResolvedValue({ message: {} }),
			});
		const adapter = new CrossrefAcademicWorkAdapter(fetcher);
		const query = { sourceIdentifier: '1234567X' };
		await expect(adapter.search(query)).rejects.toMatchObject({
			code: 'timeout',
		});
		await expect(adapter.search(query)).rejects.toMatchObject({
			code: 'unavailable',
		});
		await expect(adapter.search(query)).rejects.toMatchObject({
			code: 'invalid-response',
		});
		await expect(adapter.search(query)).rejects.not.toThrow('secret');
	});

	it('rejects invalid query input before calling the source', async () => {
		const fetcher = vi.fn();
		const adapter = new CrossrefAcademicWorkAdapter(fetcher);
		await expect(
			adapter.search({ sourceIdentifier: '../works' }),
		).rejects.toThrow(RangeError);
		await expect(
			adapter.search({ sourceIdentifier: '1234567X', limit: 0 }),
		).rejects.toThrow(RangeError);
		expect(fetcher).not.toHaveBeenCalled();
	});
});
