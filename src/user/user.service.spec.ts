import { createHmac } from 'node:crypto';

import {
	BadRequestException,
	ForbiddenException,
	Logger,
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

const codeHash = (code: string): string =>
	createHmac('sha256', 'a-secure-test-secret-with-at-least-32-chars')
		.update(code)
		.digest('hex');

describe('UserService', () => {
	let users: ReturnType<typeof createMockPrisma>['users'];
	let redis: ReturnType<typeof createMockRedis>;
	let auth: Record<string, ReturnType<typeof vi.fn>>;
	let i18n: { t: ReturnType<typeof vi.fn> };
	let config: { getOrThrow: ReturnType<typeof vi.fn> };
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
			markEmailVerified: vi.fn(),
		};
		config = {
			getOrThrow: vi.fn(
				() => 'a-secure-test-secret-with-at-least-32-chars',
			),
		};
		i18n = { t: vi.fn((key: string) => key) };
		mail = { sendTextEmail: vi.fn() };
		service = new UserService(
			prismaMock.prisma as never,
			auth as never,
			config as never,
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
					codeHash: codeHash('123456'),
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
		expect(auth.markEmailVerified).toHaveBeenCalledWith('test-subject');
		expect(redis.eval).toHaveBeenCalledTimes(1);
	});

	it('does not set profile claims when Firebase email verification fails', async () => {
		users.findByEmail.mockResolvedValue(null);
		users.create.mockResolvedValue(profile);
		auth.markEmailVerified.mockRejectedValue(
			new Error('Firebase unavailable'),
		);

		await expect(
			service.createProfile(
				mockUser({ id: undefined, email: profile.email }),
				{ name: profile.name, email: profile.email, code: '123456' },
			),
		).rejects.toThrow('Firebase unavailable');
		expect(users.create).toHaveBeenCalledOnce();
		expect(auth.setUserClaims).not.toHaveBeenCalled();
	});

	it('reconciles only the expected concurrent email uniqueness violation', async () => {
		users.findByEmail
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce(profile);
		users.create.mockRejectedValue({
			code: '23505',
			constraint: 'user_email_key',
		});

		await expect(
			service.createProfile(
				mockUser({ id: undefined, email: profile.email }),
				{ name: profile.name, email: profile.email, code: '123456' },
			),
		).resolves.toEqual(profile);
		expect(users.findByEmail).toHaveBeenCalledTimes(2);
	});

	it('propagates unexpected database errors during profile creation', async () => {
		const databaseError = new Error('database unavailable');
		users.findByEmail.mockResolvedValue(null);
		users.create.mockRejectedValue(databaseError);

		await expect(
			service.createProfile(
				mockUser({ id: undefined, email: profile.email }),
				{ name: profile.name, email: profile.email, code: '123456' },
			),
		).rejects.toBe(databaseError);
		expect(auth.setUserClaims).not.toHaveBeenCalled();
	});

	it('reconciles an existing profile after verifying the email code', async () => {
		users.findByEmail.mockResolvedValue(profile);
		redis.get
			.mockResolvedValueOnce(
				JSON.stringify({
					codeHash: codeHash('123456'),
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
		expect(redis.eval).toHaveBeenCalledTimes(1);
	});

	it('does not reconcile an existing profile without a valid email code', async () => {
		users.findByEmail.mockResolvedValue(profile);
		redis.get
			.mockResolvedValueOnce(
				JSON.stringify({
					codeHash: codeHash('123456'),
					expiresAt: Date.now() + 600_000,
				}),
			)
			.mockResolvedValueOnce('0');
		redis.eval.mockResolvedValue(0);

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
		expect(auth.markEmailVerified).not.toHaveBeenCalled();
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
					codeHash: codeHash('123456'),
					expiresAt: Date.now() + 600_000,
				}),
			)
			.mockResolvedValueOnce('0');
		redis.eval.mockResolvedValue(0);

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
		expect(redis.eval).toHaveBeenCalledWith(
			expect.any(String),
			2,
			'email-verification-code:user@example.com',
			'email-verification-code:user@example.com:attempts',
			expect.any(String),
			expect.any(Number),
			5,
		);
	});

	it('sends a six-digit verification code for an email without a profile', async () => {
		users.findByEmail.mockResolvedValue(null);
		i18n.t.mockImplementation((key: string, options?: unknown) => {
			if (key !== 'emails.EMAIL_VERIFICATION_BODY') return key;
			return (options as { args: { code: string } }).args.code;
		});
		await service.sendEmailVerificationCode('ada@example.com');

		expect(redis.transaction.setex).toHaveBeenNthCalledWith(
			1,
			'email-verification-code:ada@example.com',
			600,
			expect.stringContaining('codeHash'),
		);
		const storedVerification = JSON.parse(
			redis.transaction.setex.mock.calls[0][2] as string,
		) as { codeHash: string; expiresAt: number };
		const emailBody = mail.sendTextEmail.mock.calls[0][0]
			.textContent as string;
		const sentCode = emailBody.match(/\b\d{6}\b/)?.[0];
		expect(sentCode).toBeDefined();
		expect(storedVerification.codeHash).toBe(codeHash(sentCode!));
		expect(JSON.stringify(storedVerification)).not.toContain(sentCode!);
		expect(redis.transaction.setex).toHaveBeenNthCalledWith(
			2,
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
		await service.sendEmailVerificationCode(profile.email);

		expect(redis.transaction.setex).toHaveBeenCalledTimes(2);
		expect(mail.sendTextEmail).toHaveBeenCalledWith(
			expect.objectContaining({ to: [{ email: profile.email }] }),
		);
	});

	it('distinguishes a missing Firebase account in the admin list', async () => {
		users.list.mockReturnValue(
			(function* () {
				yield profile;
			})(),
		);
		users.findById.mockResolvedValue(profile);
		auth.getUserByEmail.mockResolvedValue(undefined);

		await expect(service.listUsers(mockAdmin(), 1, 20)).resolves.toEqual([
			{ ...profile, roles: [], authAccountExists: false },
		]);
	});

	it('maps Firebase lookup failures to service unavailable', async () => {
		users.list.mockReturnValue(
			(function* () {
				yield profile;
			})(),
		);
		users.findById.mockResolvedValue(profile);
		auth.getUserByEmail.mockRejectedValue(
			new Error('Firebase unavailable'),
		);

		await expect(service.listUsers(mockAdmin(), 1, 20)).rejects.toThrow(
			ServiceUnavailableException,
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

	it('fails closed when Firebase is unavailable during the admin count', async () => {
		const adminProfile = { ...profile, roles: [UserRole.ADMIN] };
		users.findById.mockResolvedValue(adminProfile);
		users.findAllActive.mockReturnValue([adminProfile]);
		auth.getUserByEmail
			.mockResolvedValueOnce(
				mockAdmin({ email: profile.email, subject: 'admin-subject' }),
			)
			.mockRejectedValueOnce(new Error('Firebase unavailable'));

		await expect(
			service.updateRoles(mockAdmin({ id: profile.id }), profile.id, [
				UserRole.USER,
			]),
		).rejects.toThrow(ServiceUnavailableException);
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

	it('logs both failures when status compensation fails', async () => {
		users.findById.mockResolvedValue(profile);
		users.update.mockRejectedValue(new Error('database unavailable'));
		auth.getUserByEmail.mockResolvedValue(
			mockUser({ email: profile.email, roles: [UserRole.USER] }),
		);
		auth.disableUser.mockResolvedValue(undefined);
		auth.enableUser.mockRejectedValue(new Error('Firebase unavailable'));
		const loggerError = vi
			.spyOn(Logger.prototype, 'error')
			.mockImplementation(() => undefined);

		await expect(
			service.updateStatus(mockAdmin(), profile.id, false),
		).rejects.toThrow(ServiceUnavailableException);
		expect(loggerError).toHaveBeenCalledWith(
			expect.objectContaining({
				event: 'user_status_compensation_failed',
				'user.id': profile.id,
				'auth.previous_status': true,
				'auth.desired_status': false,
				'error.primary_type': 'Error',
				'error.compensation_type': 'Error',
			}),
		);
		loggerError.mockRestore();
	});
});
