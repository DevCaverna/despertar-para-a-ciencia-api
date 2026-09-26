import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';

import { AppController } from './app.controller.js';
import { PrismaService } from './prisma/prisma.service.js';

describe('AppController', () => {
	it('returns liveness without querying PostgreSQL', () => {
		const controller = new AppController(
			{} as unknown as PrismaService,
			{} as unknown as Redis,
		);

		expect(controller.live()).toEqual({ status: 'ok' });
	});

	it('returns readiness after querying PostgreSQL and Redis', async () => {
		const healthCheck = vi.fn().mockResolvedValue(undefined);
		const redisPing = vi.fn().mockResolvedValue('PONG');
		const controller = new AppController(
			{
				healthCheck,
			} as unknown as PrismaService,
			{
				ping: redisPing,
			} as unknown as Redis,
		);

		await expect(controller.ready()).resolves.toEqual({ status: 'ok' });
		expect(healthCheck).toHaveBeenCalledOnce();
		expect(redisPing).toHaveBeenCalledOnce();
	});

	it('reports unavailable when PostgreSQL or Redis cannot be queried', async () => {
		const loggerError = vi
			.spyOn(Logger.prototype, 'error')
			.mockImplementation(() => undefined);
		const controller = new AppController(
			{
				healthCheck: vi.fn().mockRejectedValue(new Error('offline')),
			} as unknown as PrismaService,
			{
				ping: vi.fn(),
			} as unknown as Redis,
		);

		await expect(controller.ready()).rejects.toBeInstanceOf(
			ServiceUnavailableException,
		);
		expect(loggerError).toHaveBeenCalledWith({
			event: 'readiness_failed',
			dependency: 'postgresql_or_redis',
			'error.type': 'Error',
		});
		loggerError.mockRestore();
	});
});
