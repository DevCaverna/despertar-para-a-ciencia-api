import { describe, expect, it, vi } from 'vitest';

import {
	AiProviderError,
	type AiDraftGeneratorPort,
	type GenerateDraftInput,
} from '../domain/ai-draft-generator.port.js';
import { NoopAiDraftAdapter } from '../infrastructure/noop-ai-draft.adapter.js';
import { AiDraftService } from './ai-draft.service.js';

const validInput: GenerateDraftInput = {
	title: 'Study title',
	authors: ['Ada Lovelace'],
	abstract: 'Study abstract.',
	doi: '10.1234/test',
};

describe('AiDraftService', () => {
	it('delegates valid inputs to the configured port', async () => {
		const generateDraft = vi.fn().mockResolvedValue({
			title: 'Título gerado',
			content: 'Conteúdo gerado',
		});
		const service = new AiDraftService({
			generateDraft,
		} satisfies AiDraftGeneratorPort);

		await expect(service.generateDraft(validInput)).resolves.toEqual({
			title: 'Título gerado',
			content: 'Conteúdo gerado',
		});
		expect(generateDraft).toHaveBeenCalledWith(validInput);
	});

	it('rejects blank title or abstract before invoking the provider', async () => {
		const generateDraft = vi.fn();
		const service = new AiDraftService({
			generateDraft,
		} satisfies AiDraftGeneratorPort);

		await expect(
			service.generateDraft({ ...validInput, abstract: '   ' }),
		).rejects.toEqual(new AiProviderError('invalid-input'));
		expect(generateDraft).not.toHaveBeenCalled();
	});

	it('fails explicitly when using NoopAiDraftAdapter', async () => {
		const service = new AiDraftService(new NoopAiDraftAdapter());

		await expect(service.generateDraft(validInput)).rejects.toEqual(
			new AiProviderError('configuration'),
		);
	});
});
