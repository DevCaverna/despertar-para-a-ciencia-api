import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	AiProviderError,
	type GenerateDraftInput,
} from '../domain/ai-draft-generator.port.js';
import { GeminiDraftAdapter } from './gemini-draft.adapter.js';

const sampleInput: GenerateDraftInput = {
	title: 'Quantum Dots in Solar Cells',
	authors: ['Ada Lovelace', 'Grace Hopper'],
	abstract: 'This study evaluates efficiency gains using quantum dots.',
	publicationDate: '2025-06',
	journal: 'Science Journal',
	doi: '10.1234/example',
	url: 'https://example.com/article',
};

const adapter = new GeminiDraftAdapter({
	apiKey: 'secret-gemini-key',
	model: 'gemini-2.5-flash',
	timeoutMs: 15_000,
});

describe('GeminiDraftAdapter', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('sends work metadata with header auth, skips thought parts, and parses structured JSON output', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					candidates: [
						{
							finishReason: 'STOP',
							content: {
								parts: [
									{
										thought: true,
										text: 'Internal reasoning should be ignored.',
									},
									{
										text: '{"title":"  Pontos quânticos em células solares  ",',
									},
									{
										text: '"content":"  Rascunho baseado exclusivamente no resumo fornecido.  "}',
									},
								],
							},
						},
					],
				}),
				{ status: 200 },
			),
		);
		vi.stubGlobal('fetch', fetchMock);

		await expect(adapter.generateDraft(sampleInput)).resolves.toEqual({
			title: 'Pontos quânticos em células solares',
			content: 'Rascunho baseado exclusivamente no resumo fornecido.',
		});

		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe(
			'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
		);
		expect(url).not.toContain('secret-gemini-key');
		expect(init.headers).toMatchObject({
			'Content-Type': 'application/json',
			'x-goog-api-key': 'secret-gemini-key',
		});
		const body = JSON.parse(init.body as string) as {
			contents: Array<{ parts: Array<{ text: string }> }>;
		};
		expect(body.contents[0]?.parts[0]?.text).toContain('<source_work>');
		expect(body.contents[0]?.parts[0]?.text).toContain(
			sampleInput.abstract,
		);
		expect(body.contents[0]?.parts[0]?.text).toContain(sampleInput.doi);
	});

	it('maps request timeouts (TimeoutError and AbortError) to AiProviderError("timeout")', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockRejectedValueOnce(
					new DOMException('Timed out', 'TimeoutError'),
				)
				.mockRejectedValueOnce(
					Object.assign(new Error('Aborted'), { name: 'AbortError' }),
				),
		);

		await expect(adapter.generateDraft(sampleInput)).rejects.toMatchObject({
			name: 'AiProviderError',
			code: 'timeout',
		});
		await expect(adapter.generateDraft(sampleInput)).rejects.toMatchObject({
			name: 'AiProviderError',
			code: 'timeout',
		});
	});

	it('maps 401 and 403 HTTP responses to AiProviderError("configuration")', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValueOnce(
					new Response('Unauthorized', { status: 401 }),
				)
				.mockResolvedValueOnce(
					new Response('Forbidden', { status: 403 }),
				),
		);

		await expect(adapter.generateDraft(sampleInput)).rejects.toEqual(
			new AiProviderError('configuration'),
		);
		await expect(adapter.generateDraft(sampleInput)).rejects.toEqual(
			new AiProviderError('configuration'),
		);
	});

	it('maps 429, 5xx HTTP responses and network failures to AiProviderError("unavailable")', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValueOnce(
					new Response('Rate limited', { status: 429 }),
				)
				.mockResolvedValueOnce(
					new Response('Server error', { status: 503 }),
				)
				.mockRejectedValueOnce(new Error('ECONNRESET')),
		);

		await expect(adapter.generateDraft(sampleInput)).rejects.toEqual(
			new AiProviderError('unavailable'),
		);
		await expect(adapter.generateDraft(sampleInput)).rejects.toEqual(
			new AiProviderError('unavailable'),
		);
		await expect(adapter.generateDraft(sampleInput)).rejects.toEqual(
			new AiProviderError('unavailable'),
		);
	});

	it('rejects non-STOP finishReason, empty candidates, or incomplete JSON with AiProviderError("invalid-response")', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValueOnce(
					new Response(JSON.stringify({ candidates: [] }), {
						status: 200,
					}),
				)
				.mockResolvedValueOnce(
					new Response(
						JSON.stringify({
							candidates: [
								{
									finishReason: 'MAX_TOKENS',
									content: {
										parts: [
											{
												text: JSON.stringify({
													title: 'Cortado',
													content: 'Texto incompleto',
												}),
											},
										],
									},
								},
							],
						}),
						{ status: 200 },
					),
				)
				.mockResolvedValueOnce(
					new Response(
						JSON.stringify({
							candidates: [
								{
									finishReason: 'SAFETY',
								},
							],
						}),
						{ status: 200 },
					),
				)
				.mockResolvedValueOnce(
					new Response(
						JSON.stringify({
							candidates: [
								{
									finishReason: 'STOP',
									content: {
										parts: [
											{
												text: JSON.stringify({
													title: 'Só título',
												}),
											},
										],
									},
								},
							],
						}),
						{ status: 200 },
					),
				),
		);

		await expect(adapter.generateDraft(sampleInput)).rejects.toEqual(
			new AiProviderError('invalid-response'),
		);
		await expect(adapter.generateDraft(sampleInput)).rejects.toEqual(
			new AiProviderError('invalid-response'),
		);
		await expect(adapter.generateDraft(sampleInput)).rejects.toEqual(
			new AiProviderError('invalid-response'),
		);
		await expect(adapter.generateDraft(sampleInput)).rejects.toEqual(
			new AiProviderError('invalid-response'),
		);
	});
});
