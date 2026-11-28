import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from 'vitest';

import { AuthService } from '../auth/application/auth.service.js';
import { UserRole } from '../auth/domain/user-role.js';
import { AuthGuard } from '../auth/presentation/auth.guard.js';
import { UserController } from './user.controller.js';
import { UserService } from './user.service.js';

const adminActor = {
	subject: 'firebase-admin',
	id: '019abcde-f000-7000-8000-000000000001',
	email: 'admin@example.com',
	roles: [UserRole.ADMIN],
	emailVerified: true,
};
const targetId = '019abcde-f000-7000-8000-000000000002';
const sampleUser = {
	id: targetId,
	name: 'Pessoa Teste',
	email: 'pessoa@example.com',
	active: true,
	createdAt: '2026-10-02T12:00:00.000Z',
	updatedAt: '2026-10-02T12:00:00.000Z',
};

describe('UserController', () => {
	let app: INestApplication;
	const updateRoles = vi.fn();
	const updateStatus = vi.fn();
	const listUsers = vi.fn();
	const validateToken = vi.fn();

	beforeAll(async () => {
		const module = await Test.createTestingModule({
			controllers: [UserController],
			providers: [
				Reflector,
				{
					provide: UserService,
					useValue: {
						createProfile: vi.fn(),
						sendEmailVerificationCode: vi.fn(),
						getProfile: vi.fn(),
						updateProfile: vi.fn(),
						listUsers,
						updateRoles,
						updateStatus,
					},
				},
				{ provide: AuthService, useValue: { validateToken } },
				{ provide: 'APP_GUARD', useClass: AuthGuard },
			],
		}).compile();
		app = module.createNestApplication();
		app.useGlobalPipes(
			new ValidationPipe({
				whitelist: true,
				forbidNonWhitelisted: true,
				transform: true,
			}),
		);
		await app.init();
	});

	beforeEach(() => {
		vi.clearAllMocks();
		validateToken.mockResolvedValue(adminActor);
		updateRoles.mockResolvedValue(sampleUser);
		updateStatus.mockResolvedValue(sampleUser);
		listUsers.mockResolvedValue([]);
	});

	afterAll(async () => {
		await app.close();
	});

	it.each(['not-a-uuid', '550e8400-e29b-41d4-a716-446655440000'])(
		'rejects invalid or non-UUIDv7 user ID (%s)',
		async (invalidId) => {
			await request(app.getHttpServer() as Server)
				.patch(`/users/${invalidId}/roles`)
				.set('Authorization', 'Bearer valid-token')
				.send({ roles: [UserRole.COLLABORATOR] })
				.expect(400);

			await request(app.getHttpServer() as Server)
				.patch(`/users/${invalidId}/status`)
				.set('Authorization', 'Bearer valid-token')
				.send({ active: false })
				.expect(400);

			expect(updateRoles).not.toHaveBeenCalled();
			expect(updateStatus).not.toHaveBeenCalled();
		},
	);

	it('forwards valid UUIDv7 admin updates to the service', async () => {
		await request(app.getHttpServer() as Server)
			.patch(`/users/${targetId}/roles`)
			.set('Authorization', 'Bearer valid-token')
			.send({ roles: [UserRole.COLLABORATOR] })
			.expect(200);

		await request(app.getHttpServer() as Server)
			.patch(`/users/${targetId}/status`)
			.set('Authorization', 'Bearer valid-token')
			.send({ active: false })
			.expect(200);

		expect(updateRoles).toHaveBeenCalledWith(adminActor, targetId, [
			UserRole.COLLABORATOR,
		]);
		expect(updateStatus).toHaveBeenCalledWith(adminActor, targetId, false);
	});
});
