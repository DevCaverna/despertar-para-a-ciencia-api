import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';

import type { AppConfig } from '../config/config.types.js';
import {
	MAX_UPLOAD_SIZE_BYTES,
	StorageService,
} from './application/storage.service.js';
import { STORAGE_PORT } from './domain/storage.port.js';
import { InMemoryStorageAdapter } from './infrastructure/in-memory-storage.adapter.js';
import { R2StorageAdapter } from './infrastructure/r2-storage.adapter.js';

@Module({
	imports: [
		ConfigModule,
		MulterModule.register({
			limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
		}),
	],
	providers: [
		{
			provide: STORAGE_PORT,
			inject: [ConfigService],
			useFactory: (config: ConfigService<AppConfig, true>) => {
				const storageDriver = config.getOrThrow('storage.driver', {
					infer: true,
				});

				if (storageDriver === 'memory') {
					return new InMemoryStorageAdapter();
				}
				if (storageDriver === 'r2') {
					return new R2StorageAdapter(
						config.getOrThrow('storage.r2', { infer: true }),
					);
				}

				throw new Error(
					'STORAGE_DRIVER must be either "memory" or "r2".',
				);
			},
		},
		StorageService,
	],
	exports: [StorageService],
})
export class StorageModule {}
