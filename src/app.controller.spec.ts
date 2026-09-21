import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { AppController } from './app.controller.js';
import { PrismaService } from './prisma/prisma.service.js';

describe('AppController', () => {
	it('returns liveness without querying PostgreSQL', () => {
		const controller = new AppController({} as unknown as PrismaService);

		expect(controller.live()).toEqual({ status: 'ok' });
	});

	it('returns readiness after querying PostgreSQL', async () => {
		const healthCheck = vi.fn().mockResolvedValue(undefined);
		const controller = new AppController({
			healthCheck,
		} as unknown as PrismaService);

		await expect(controller.ready()).resolves.toEqual({ status: 'ok' });
		expect(healthCheck).toHaveBeenCalledOnce();
	});

	it('reports unavailable when PostgreSQL cannot be queried', async () => {
		const loggerError = vi
			.spyOn(Logger.prototype, 'error')
			.mockImplementation(() => undefined);
		const controller = new AppController({
			healthCheck: vi.fn().mockRejectedValue(new Error('offline')),
		} as unknown as PrismaService);

		await expect(controller.ready()).rejects.toBeInstanceOf(
			ServiceUnavailableException,
		);
		expect(loggerError).toHaveBeenCalledWith({
			event: 'readiness_failed',
			dependency: 'postgresql',
			'error.type': 'Error',
		});
		loggerError.mockRestore();
	});
});
