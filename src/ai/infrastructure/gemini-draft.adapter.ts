import { Injectable } from '@nestjs/common';

import type { GeminiConfig } from '../../config/config.types.js';
import {
	AiProviderError,
	type AiDraftGeneratorPort,
	type GenerateDraftInput,
	type GeneratedDraft,
} from '../domain/ai-draft-generator.port.js';
import {
	buildDraftUserPrompt,
	DRAFT_SYSTEM_INSTRUCTION,
	parseGeneratedDraft,
} from '../domain/draft-prompt.js';

const GEMINI_API_BASE =
	'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_CAUSE_CODES = new Set([
	'UND_ERR_HEADERS_TIMEOUT',
	'UND_ERR_BODY_TIMEOUT',
	'UND_ERR_CONNECT_TIMEOUT',
]);

interface GeminiCandidatePart {
	thought?: unknown;
	text?: unknown;
}

interface GeminiCandidate {
	finishReason?: unknown;
	content?: {
		parts?: GeminiCandidatePart[];
	};
}

interface GeminiGenerateContentResponse {
	candidates?: GeminiCandidate[];
}

function isTimeoutError(error: unknown): boolean {
	if (
		(error instanceof DOMException || error instanceof Error) &&
		(error.name === 'TimeoutError' || error.name === 'AbortError')
	) {
		return true;
	}
	if (
		error instanceof Error &&
		error.cause &&
		typeof error.cause === 'object' &&
		'code' in error.cause &&
		typeof error.cause.code === 'string'
	) {
		return TIMEOUT_CAUSE_CODES.has(error.cause.code);
	}
	return false;
}

/**
 * Google Gemini REST adapter implementing {@link AiDraftGeneratorPort}.
 */
@Injectable()
export class GeminiDraftAdapter implements AiDraftGeneratorPort {
	constructor(private readonly config: GeminiConfig) {}

	async generateDraft(input: GenerateDraftInput): Promise<GeneratedDraft> {
		const endpoint = `${GEMINI_API_BASE}/${encodeURIComponent(this.config.model)}:generateContent`;
		let response: Response;

		try {
			response = await fetch(endpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-goog-api-key': this.config.apiKey,
				},
				body: JSON.stringify({
					systemInstruction: {
						parts: [{ text: DRAFT_SYSTEM_INSTRUCTION }],
					},
					contents: [
						{
							role: 'user',
							parts: [{ text: buildDraftUserPrompt(input) }],
						},
					],
					generationConfig: {
						temperature: 0.3,
						responseMimeType: 'application/json',
						responseSchema: {
							type: 'OBJECT',
							properties: {
								title: { type: 'STRING' },
								content: { type: 'STRING' },
							},
							required: ['title', 'content'],
						},
					},
				}),
				signal: AbortSignal.timeout(this.config.timeoutMs),
			});
		} catch (error) {
			if (isTimeoutError(error)) {
				throw new AiProviderError('timeout');
			}
			throw new AiProviderError('unavailable');
		}

		if (!response.ok) {
			if (response.status === 401 || response.status === 403) {
				throw new AiProviderError('configuration');
			}
			throw new AiProviderError('unavailable');
		}

		let payload: GeminiGenerateContentResponse;
		try {
			payload = (await response.json()) as GeminiGenerateContentResponse;
		} catch {
			throw new AiProviderError('invalid-response');
		}

		const candidate = payload.candidates?.[0];
		if (!candidate) {
			throw new AiProviderError('invalid-response');
		}
		if (
			candidate.finishReason !== undefined &&
			candidate.finishReason !== 'STOP'
		) {
			throw new AiProviderError('invalid-response');
		}

		const parts = candidate.content?.parts;
		if (!Array.isArray(parts)) {
			throw new AiProviderError('invalid-response');
		}

		const text = parts
			.filter(
				(part): part is { text: string } =>
					part.thought !== true && typeof part.text === 'string',
			)
			.map((part) => part.text)
			.join('');

		if (!text.trim()) {
			throw new AiProviderError('invalid-response');
		}

		return parseGeneratedDraft(text);
	}
}
