import { InjectRedis } from '@nestjs-modules/ioredis';
import {
	Controller,
	Get,
	Logger,
	ServiceUnavailableException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { metrics } from '@opentelemetry/api';
import { Redis } from 'ioredis';

import { Public } from './decorators/public.decorator.js';
import { PrismaService } from './prisma/prisma.service.js';
import { errorType } from './telemetry/telemetry.js';

const readinessDuration = metrics
	.getMeter('despertar-para-a-ciencia-api.health')
	.createHistogram('application.readiness.duration', {
		unit: 'ms',
		description: 'Duration of the PostgreSQL readiness check.',
	});

@ApiTags('Health')
@Controller('health')
export class AppController {
	private readonly logger = new Logger(AppController.name);

	constructor(
		private readonly prisma: PrismaService,
		@InjectRedis() private readonly redis: Redis,
	) {}

	@Public()
	@Get()
	check(): { status: string } {
		return { status: 'ok' };
	}

	@Public()
	@Get('live')
	live(): { status: string } {
		return { status: 'ok' };
	}

	@Public()
	@Get('ready')
	async ready(): Promise<{ status: string }> {
		const startedAt = performance.now();
		try {
			await Promise.all([this.prisma.healthCheck(), this.redis.ping()]);
			readinessDuration.record(performance.now() - startedAt, {
				result: 'success',
			});
			return { status: 'ok' };
		} catch (error) {
			readinessDuration.record(performance.now() - startedAt, {
				result: 'error',
			});
			this.logger.error({
				event: 'readiness_failed',
				dependency: 'postgresql_or_redis',
				'error.type': errorType(error),
			});
			throw new ServiceUnavailableException({ status: 'error' });
		}
	}
}
