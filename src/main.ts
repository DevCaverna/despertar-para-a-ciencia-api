import { ConfigService } from '@nestjs/config';

import { createApplication } from './bootstrap.js';
import type { AppConfig } from './config/config.types.js';

async function bootstrap(): Promise<void> {
	const app = await createApplication();
	await app.listen(
		app.get(ConfigService<AppConfig, true>).getOrThrow('app.port', {
			infer: true,
		}),
	);
}

void bootstrap();
