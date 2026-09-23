import {
	BadRequestException,
	ForbiddenException,
	ServiceUnavailableException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockAdmin, mockUser } from '../../test/mocks/auth.mock.js';
import { createMockPrisma } from '../../test/mocks/prisma.mock.js';
import { createMockRedis } from '../../test/mocks/redis.mock.js';
import { UserRole } from '../auth/domain/user-role.js';
import type { User } from './models/user.model.js';
import { UserService } from './user.service.js';

const profile: User = {
	id: '019abcde-f000-7000-8000-000000000001',
	name: 'Ada Lovelace',
	email: 'ada@example.com',
	active: true,
	createdAt: '2026-09-23T12:00:00.000Z',
	updatedAt: '2026-09-23T12:00:00.000Z',
};

describe('UserService', () => {
	let users: ReturnType<typeof createMockPrisma>['users'];
	let redis: ReturnType<typeof createMockRedis>;
	let auth: Record<string, ReturnType<typeof vi.fn>>;
	let i18n: { t: ReturnType<typeof vi.fn> };
	let mail: { sendTextEmail: ReturnType<typeof vi.fn> };
	let service: UserService;

	beforeEach(() => {
		const prismaMock = createMockPrisma();
		users = prismaMock.users;
		redis = createMockRedis();
		auth = {
			setUserClaims: vi.fn(),
			getUserByEmail: vi.fn(),
			enableUser: vi.fn(),
			disableUser: vi.fn(),
			revokeSessions: vi.fn(),
		};
		i18n = { t: vi.fn((key: string) => key) };
		mail = { sendTextEmail: vi.fn() };
		service = new UserService(
			prismaMock.prisma as never,
			auth as never,
			i18n as never,
			mail as never,
			redis as never,
		);
	});

	it('creates a verified profile and binds its PostgreSQL ID to Firebase', async () => {
		users.findByEmail.mockResolvedValue(null);
		redis.get
			.mockResolvedValueOnce(
				JSON.stringify({
					codeHash:
						'8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
					expiresAt: Date.now() + 600_000,
				}),
			)
			.mockResolvedValueOnce('0');
		users.create.mockResolvedValue(profile);

		await expect(
			service.createProfile(
				mockUser({
					id: undefined,
					email: 'Ada@Example.com',
					roles: [],
				}),
				{
					name: 'Ada Lovelace',
					email: 'ada@example.com',
					code: '123456',
				},
			),
		).resolves.toEqual(profile);
		expect(users.create).toHaveBeenCalledWith({
			name: 'Ada Lovelace',
			email: 'ada@example.com',
		});
		expect(auth.setUserClaims).toHaveBeenCalledWith({
			subject: 'test-subject',
			id: profile.id,
			roles: [UserRole.USER],
		});
		expect(redis.del).toHaveBeenCalledWith(
			'email-verification-code:ada@example.com',
			'email-verification-code:ada@example.com:attempts',
		);
	});

	it('reconciles an existing profile after verifying the email code', async () => {
		users.findByEmail.mockResolvedValue(profile);
		redis.get
			.mockResolvedValueOnce(
				JSON.stringify({
					codeHash:
						'8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
					expiresAt: Date.now() + 600_000,
				}),
			)
			.mockResolvedValueOnce('0');

		await expect(
			service.createProfile(
				mockUser({ id: undefined, email: profile.email }),
				{
					name: 'Other',
					email: profile.email,
					code: '123456',
				},
			),
		).resolves.toEqual(profile);
		expect(users.create).not.toHaveBeenCalled();
		expect(auth.setUserClaims).toHaveBeenCalledWith({
			subject: 'test-subject',
			id: profile.id,
			roles: [UserRole.USER],
		});
		expect(redis.del).toHaveBeenCalledWith(
			'email-verification-code:ada@example.com',
			'email-verification-code:ada@example.com:attempts',
		);
	});

	it('does not reconcile an existing profile without a valid email code', async () => {
		users.findByEmail.mockResolvedValue(profile);
		redis.get
			.mockResolvedValueOnce(
				JSON.stringify({
					codeHash:
						'8d969eef6ec3d29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
					expiresAt: Date.now() + 600_000,
				}),
			)
			.mockResolvedValueOnce('0');
		redis.incr.mockResolvedValue(1);

		await expect(
			service.createProfile(
				mockUser({ id: undefined, email: profile.email }),
				{
					name: 'Other',
					email: profile.email,
					code: '000000',
				},
			),
		).rejects.toThrow(BadRequestException);
		expect(auth.setUserClaims).not.toHaveBeenCalled();
	});

	it('rejects a profile email that differs from the authenticated email', async () => {
		await expect(
			service.createProfile(mockUser(), {
				name: 'Ada Lovelace',
				email: 'other@example.com',
				code: '123456',
			}),
		).rejects.toThrow(ForbiddenException);
	});

	it('rejects an invalid verification code', async () => {
		users.findByEmail.mockResolvedValue(null);
		redis.get
			.mockResolvedValueOnce(
				JSON.stringify({
					codeHash:
						'8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
					expiresAt: Date.now() + 600_000,
				}),
			)
			.mockResolvedValueOnce('0');
		redis.incr.mockResolvedValue(1);

		await expect(
			service.createProfile(
				mockUser({ id: undefined, email: 'user@example.com' }),
				{
					name: 'Ada Lovelace',
					email: 'user@example.com',
					code: '000000',
				},
			),
		).rejects.toThrow(BadRequestException);
		expect(users.create).not.toHaveBeenCalled();
		expect(redis.expire).toHaveBeenCalledWith(
			'email-verification-code:user@example.com:attempts',
			expect.any(Number),
		);
	});

	it('sends a six-digit verification code for an email without a profile', async () => {
		users.findByEmail.mockResolvedValue(null);
		redis.setex.mockResolvedValue(undefined);

		await service.sendEmailVerificationCode('ada@example.com');

		expect(redis.setex).toHaveBeenCalledWith(
			'email-verification-code:ada@example.com',
			600,
			expect.stringContaining('codeHash'),
		);
		expect(redis.setex).toHaveBeenCalledWith(
			'email-verification-code:ada@example.com:attempts',
			600,
			'0',
		);
		expect(mail.sendTextEmail).toHaveBeenCalledWith(
			expect.objectContaining({ to: [{ email: 'ada@example.com' }] }),
		);
	});

	it('sends a verification code for an email with an existing profile', async () => {
		users.findByEmail.mockResolvedValue(profile);
		redis.setex.mockResolvedValue(undefined);

		await service.sendEmailVerificationCode(profile.email);

		expect(redis.setex).toHaveBeenCalledTimes(2);
		expect(mail.sendTextEmail).toHaveBeenCalledWith(
			expect.objectContaining({ to: [{ email: profile.email }] }),
		);
	});

	it('does not remove the last active administrator', async () => {
		const adminProfile = { ...profile, roles: [UserRole.ADMIN] };
		users.findById.mockResolvedValue(adminProfile);
		users.findAllActive.mockReturnValue([adminProfile]);
		auth.getUserByEmail.mockResolvedValue(
			mockAdmin({
				email: profile.email,
				subject: 'admin-subject',
			}),
		);

		await expect(
			service.updateRoles(mockAdmin({ id: profile.id }), profile.id, [
				UserRole.USER,
			]),
		).rejects.toThrow(BadRequestException);
		expect(auth.setUserClaims).not.toHaveBeenCalled();
	});

	it('retries session revocation once after a transient failure', async () => {
		users.findById.mockResolvedValue(profile);
		auth.getUserByEmail.mockResolvedValue(
			mockUser({ email: profile.email, roles: [UserRole.USER] }),
		);
		auth.revokeSessions
			.mockRejectedValueOnce(new Error('temporary failure'))
			.mockResolvedValueOnce(undefined);

		await expect(
			service.updateRoles(mockAdmin({ id: profile.id }), profile.id, [
				UserRole.USER,
			]),
		).resolves.toEqual(profile);
		expect(auth.revokeSessions).toHaveBeenCalledTimes(2);
	});

	it('returns service unavailable when session revocation keeps failing', async () => {
		users.findById.mockResolvedValue(profile);
		auth.getUserByEmail.mockResolvedValue(
			mockUser({ email: profile.email, roles: [UserRole.USER] }),
		);
		auth.revokeSessions.mockRejectedValue(
			new Error('Firebase unavailable'),
		);

		await expect(
			service.updateRoles(mockAdmin({ id: profile.id }), profile.id, [
				UserRole.USER,
			]),
		).rejects.toThrow(ServiceUnavailableException);
		expect(auth.revokeSessions).toHaveBeenCalledTimes(2);
		expect(i18n.t).toHaveBeenCalledWith(
			'errors.SESSION_REVOCATION_PENDING',
		);
	});
});
