export const AI_DRAFT_GENERATOR_PORT = Symbol('AiDraftGeneratorPort');

export interface GenerateDraftInput {
	title: string;
	authors: string[];
	abstract: string;
	publicationDate?: string | null;
	journal?: string | null;
	doi: string;
	url?: string | null;
}

export interface GeneratedDraft {
	title: string;
	content: string;
}

export type AiProviderErrorCode =
	| 'configuration'
	| 'invalid-input'
	| 'invalid-response'
	| 'timeout'
	| 'unavailable';

/**
 * Typed domain error emitted by AI draft generation adapters.
 */
export class AiProviderError extends Error {
	constructor(public readonly code: AiProviderErrorCode) {
		super(`AI provider ${code}.`);
		this.name = 'AiProviderError';
	}
}

export interface AiDraftGeneratorPort {
	generateDraft(input: GenerateDraftInput): Promise<GeneratedDraft>;
}
