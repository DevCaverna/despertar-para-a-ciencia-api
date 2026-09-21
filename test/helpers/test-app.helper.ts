import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { I18nValidationPipe, I18nValidationExceptionFilter } from 'nestjs-i18n';
import { Logger } from 'nestjs-pino';
import { vi, type Mock } from 'vitest';

import { AppModule } from '../../src/app.module.js';
import { AUTH_PORT } from '../../src/auth/domain/auth.port.js';
import type { AuthUser } from '../../src/auth/domain/auth.types.js';

/**
 * Cria uma aplicação NestJS de teste completa com:
 * - Firebase/AuthPort mockado
 * - Prisma, auth e mail reais
 */
export async function createTestApp(): Promise<{
	app: INestApplication;
	module: TestingModule;
	mockAuthPort: Record<string, Mock>;
}> {
	const mockAuthPort = {
		validateToken: vi.fn(),
		markEmailAsVerified: vi.fn().mockResolvedValue(undefined),
		assignUserRoles: vi.fn().mockResolvedValue(undefined),
		revokeUserRoles: vi.fn().mockResolvedValue(undefined),
		updatePassword: vi.fn().mockResolvedValue(undefined),
		getUserByEmail: vi.fn(),
		deleteUserByEmail: vi.fn().mockResolvedValue(undefined),
	};

	const module = await Test.createTestingModule({
		imports: [AppModule],
	})
		.overrideProvider(AUTH_PORT)
		.useValue(mockAuthPort)
		.compile();

	const app: INestApplication = module.createNestApplication({
		bufferLogs: true,
	});
	app.useLogger(app.get(Logger));

	(
		app.getHttpAdapter().getInstance() as {
			set: (k: string, v: string) => void;
		}
	).set('query parser', 'extended');

	app.useGlobalPipes(
		new I18nValidationPipe({
			whitelist: true,
			forbidNonWhitelisted: true,
			transform: true,
		}),
	);
	app.useGlobalFilters(new I18nValidationExceptionFilter());

	app.enableShutdownHooks();

	await app.init();

	return { app, module, mockAuthPort };
}

/**
 * Helper para simular autenticação de um usuário.
 * Configura o mockAuthPort para retornar o user fornecido ao validar qualquer token.
 */
export function authenticateAs(
	mockAuthPort: Record<string, Mock>,
	user: AuthUser,
): void {
	mockAuthPort.validateToken.mockResolvedValue(user);
}
