import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';

import { shutdownTelemetry } from '../instrumentation.js';
import { errorType } from './telemetry.js';

@Injectable()
export class TelemetryShutdownService implements OnApplicationShutdown {
	private readonly logger = new Logger(TelemetryShutdownService.name);

	async onApplicationShutdown(): Promise<void> {
		try {
			await shutdownTelemetry();
		} catch (error) {
			this.logger.error({
				event: 'telemetry_shutdown_failed',
				'error.type': errorType(error),
			});
		}
	}
}
