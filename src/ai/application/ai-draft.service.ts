import { Inject, Injectable } from '@nestjs/common';

import {
	AI_DRAFT_GENERATOR_PORT,
	AiProviderError,
	type AiDraftGeneratorPort,
	type GenerateDraftInput,
	type GeneratedDraft,
} from '../domain/ai-draft-generator.port.js';

/**
 * Application service mediating AI-assisted draft generation through {@link AiDraftGeneratorPort}.
 */
@Injectable()
export class AiDraftService {
	constructor(
		@Inject(AI_DRAFT_GENERATOR_PORT)
		private readonly generator: AiDraftGeneratorPort,
	) {}

	async generateDraft(input: GenerateDraftInput): Promise<GeneratedDraft> {
		if (!input.title.trim() || !input.abstract.trim()) {
			throw new AiProviderError('invalid-input');
		}

		return this.generator.generateDraft(input);
	}
}
