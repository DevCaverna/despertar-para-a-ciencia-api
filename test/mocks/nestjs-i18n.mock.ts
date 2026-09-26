import {
	ArgumentsHost,
	DynamicModule,
	ExceptionFilter,
	HttpException,
	Injectable,
	ValidationPipe,
} from '@nestjs/common';

export class AcceptLanguageResolver {}

export class HeaderResolver {
	readonly headers: string[];

	constructor(headers: string[] = []) {
		this.headers = headers;
	}
}

export class QueryResolver {
	readonly keys: string[];

	constructor(keys: string[] = []) {
		this.keys = keys;
	}
}

@Injectable()
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- Mirrors nestjs-i18n's generic injection type.
export class I18nService<T = unknown> {
	get translationType(): T | undefined {
		return undefined;
	}

	t(_key: string, _options?: unknown): string {
		return _key;
	}
}

export class I18nModule {
	static forRoot(_options?: unknown): DynamicModule {
		return {
			module: I18nModule,
			global: true,
			providers: [I18nService],
			exports: [I18nService],
		};
	}

	static forRootAsync(_options?: unknown): DynamicModule {
		return {
			module: I18nModule,
			global: true,
			providers: [I18nService],
			exports: [I18nService],
		};
	}
}

export class I18nValidationPipe extends ValidationPipe {}

export class I18nValidationExceptionFilter implements ExceptionFilter {
	catch(exception: unknown, host: ArgumentsHost): void {
		if (!(exception instanceof HttpException)) {
			throw exception;
		}

		const response = host.switchToHttp().getResponse();
		response.status(exception.getStatus()).json(exception.getResponse());
	}
}

export function i18nValidationMessage<T>(
	_key: T extends unknown ? string : never,
): T extends unknown ? string : never {
	return _key;
}
