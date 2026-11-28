import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import type { AppConfig } from '../config/config.types.js';
import { AiDraftService } from './application/ai-draft.service.js';
import { AI_DRAFT_GENERATOR_PORT } from './domain/ai-draft-generator.port.js';
import { GeminiDraftAdapter } from './infrastructure/gemini-draft.adapter.js';
import { NoopAiDraftAdapter } from './infrastructure/noop-ai-draft.adapter.js';

@Module({
	imports: [ConfigModule],
	providers: [
		{
			provide: AI_DRAFT_GENERATOR_PORT,
			inject: [ConfigService],
			useFactory: (config: ConfigService<AppConfig, true>) => {
				const driver = config.getOrThrow('ai.driver', { infer: true });

				if (driver === 'gemini') {
					return new GeminiDraftAdapter(
						config.getOrThrow('ai.gemini', { infer: true }),
					);
				}

				if (driver === 'noop') {
					return new NoopAiDraftAdapter();
				}

				throw new Error('AI_DRIVER must be "gemini" or "noop".');
			},
		},
		AiDraftService,
	],
	exports: [AiDraftService],
})
export class AiModule {}
