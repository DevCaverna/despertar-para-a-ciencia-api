import { Injectable } from '@nestjs/common';

import {
	AiProviderError,
	type AiDraftGeneratorPort,
	type GenerateDraftInput,
	type GeneratedDraft,
} from '../domain/ai-draft-generator.port.js';

/**
 * Fallback AI adapter used when `AI_DRIVER=noop` is active.
 */
@Injectable()
export class NoopAiDraftAdapter implements AiDraftGeneratorPort {
	generateDraft(_input: GenerateDraftInput): Promise<GeneratedDraft> {
		return Promise.reject(new AiProviderError('configuration'));
	}
}
