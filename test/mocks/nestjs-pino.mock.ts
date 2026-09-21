import { DynamicModule } from '@nestjs/common';

export class Logger {
	log(): void {}
	error(): void {}
	warn(): void {}
	debug(): void {}
}

export class LoggerModule {
	static forRoot(_options?: unknown): DynamicModule {
		return {
			module: LoggerModule,
			providers: [Logger],
			exports: [Logger],
		};
	}

	static forRootAsync(_options?: unknown): DynamicModule {
		return {
			module: LoggerModule,
			providers: [Logger],
			exports: [Logger],
		};
	}
}
