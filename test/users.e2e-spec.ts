import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { Redis } from 'ioredis';
import { I18nService } from 'nestjs-i18n';
import { Pool } from 'pg';
import request, { type Test as HttpRequest } from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { AUTH_PORT } from '../src/auth/domain/auth.port.js';
import type { AuthUser } from '../src/auth/domain/auth.types.js';
import { UserRole } from '../src/auth/domain/user-role.js';
import { configureApplication } from '../src/bootstrap.js';
import { MailService } from '../src/mail/application/mail.service.js';

type TestAccount = AuthUser & { disabled?: boolean };

const suiteId = randomUUID();

describe('User routes (e2e)', () => {
	let app: NestExpressApplication;
	let pool: Pool;
	let redis: Redis;
	let accounts: Map<string, TestAccount>;
	let tokens: Map<string, TestAccount>;
	let sentCodes: Map<string, string>;
	let authPort: {
		validateToken: ReturnType<typeof vi.fn>;
		getUserByEmail: ReturnType<typeof vi.fn>;
		getUserBySubject: ReturnType<typeof vi.fn>;
		markEmailVerified: ReturnType<typeof vi.fn>;
		setUserClaims: ReturnType<typeof vi.fn>;
		enableUser: ReturnType<typeof vi.fn>;
		disableUser: ReturnType<typeof vi.fn>;
		revokeSessions: ReturnType<typeof vi.fn>;
	};
	let emails: Set<string>;
	let ipSequence = 1;
	const nextIp = (): string => `198.51.100.${ipSequence++}`;
	const tokenFor = (account: TestAccount): string => {
		const token = `e2e-${randomUUID()}`;
		tokens.set(token, account);
		return token;
	};
	const addEmail = (local: string): string => {
		const email = `${suiteId}-${local}@example.com`;
		emails.add(email);
		return email;
	};
	const requestAs = (
		method: 'get' | 'post' | 'patch',
		url: string,
		account: TestAccount,
	): HttpRequest => {
		const client = request(app.getHttpServer());
		const route =
			method === 'get'
				? client.get(url)
				: method === 'post'
					? client.post(url)
					: client.patch(url);
		return route
			.set('Authorization', `Bearer ${tokenFor(account)}`)
			.set('X-Forwarded-For', nextIp());
	};

	async function createLocalUser(
		email: string,
		active = true,
	): Promise<string> {
		const result = await pool.query<{ id: string }>(
			'INSERT INTO public.user ("name", "email", "active") VALUES ($1, $2, $3) RETURNING "id"',
			['E2E User', email, active],
		);
		return result.rows[0].id;
	}

	async function requestVerificationCode(email: string): Promise<string> {
		const response = await request(app.getHttpServer())
			.post('/users/send-email-verification-code')
			.set('X-Forwarded-For', nextIp())
			.send({ email: ` ${email.toUpperCase()} ` });
		expect(response.status).toBe(201);
		const code = sentCodes.get(email);
		if (!code) throw new Error('Verification email was not captured');
		return code;
	}

	beforeAll(async () => {
		pool = new Pool({ connectionString: process.env.DATABASE_URL });
		redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
		emails = new Set();
		accounts = new Map();
		tokens = new Map();
		sentCodes = new Map();
		authPort = {
			validateToken: vi.fn((token: string) => {
				const account = tokens.get(token);
				if (!account || account.disabled)
					return Promise.reject(
						new Error('Invalid or disabled test account'),
					);
				return Promise.resolve({ ...account });
			}),
			getUserByEmail: vi.fn((email: string) => {
				const account = accounts.get(email.toLowerCase());
				return Promise.resolve(account ? { ...account } : undefined);
			}),
			getUserBySubject: vi.fn((subject: string) =>
				Promise.resolve(
					[...accounts.values()].find(
						(account) => account.subject === subject,
					),
				),
			),
			markEmailVerified: vi.fn((subject: string) => {
				const account = [...accounts.values()].find(
					(item) => item.subject === subject,
				);
				if (account) account.emailVerified = true;
				return Promise.resolve();
			}),
			setUserClaims: vi.fn(
				({
					subject,
					id,
					roles,
				}: {
					subject: string;
					id: string;
					roles: UserRole[];
				}) => {
					const account = [...accounts.values()].find(
						(item) => item.subject === subject,
					);
					if (account) {
						account.id = id;
						account.roles = roles;
						for (const [token, tokenAccount] of tokens) {
							if (tokenAccount.subject === subject)
								tokens.set(token, {
									...tokenAccount,
									id,
									roles,
								});
						}
					}
					return Promise.resolve();
				},
			),
			enableUser: vi.fn((subject: string) => {
				const account = [...accounts.values()].find(
					(item) => item.subject === subject,
				);
				if (account) account.disabled = false;
				return Promise.resolve();
			}),
			disableUser: vi.fn((subject: string) => {
				const account = [...accounts.values()].find(
					(item) => item.subject === subject,
				);
				if (account) account.disabled = true;
				return Promise.resolve();
			}),
			revokeSessions: vi.fn(),
		};

		const mail = {
			sendTextEmail: vi.fn(
				({
					to,
					textContent,
				}: {
					to: Array<{ email: string }>;
					textContent: string;
				}) => {
					sentCodes.set(to[0].email, textContent);
					return Promise.resolve();
				},
			),
			sendTemplateEmail: vi.fn(),
			sendHtmlEmail: vi.fn(),
		};
		const i18n = {
			t: vi.fn((key: string, options?: { args?: { code?: string } }) =>
				key === 'emails.EMAIL_VERIFICATION_BODY'
					? (options?.args?.code ?? '')
					: key,
			),
		};

		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		})
			.overrideProvider(AUTH_PORT)
			.useValue(authPort)
			.overrideProvider(MailService)
			.useValue(mail)
			.overrideProvider(I18nService)
			.useValue(i18n)
			.compile();

		app = moduleFixture.createNestApplication<NestExpressApplication>();
		await configureApplication(app);
	});

	afterAll(async () => {
		if (app) await app.close();
		if (emails.size > 0) {
			await pool.query(
				'DELETE FROM public.user WHERE "email" = ANY($1)',
				[[...emails]],
			);
		}
		for (const email of emails) {
			// oxlint-disable-next-line no-await-in-loop -- Delete each email's two isolated Redis keys.
			await redis.del(
				`email-verification-code:${email}`,
				`email-verification-code:${email}:attempts`,
			);
		}
		await pool.end();
		await redis.quit();
	});

	it('sends a code and creates a verified local profile over HTTP', async () => {
		const email = addEmail('onboard');
		const account: TestAccount = {
			subject: `subject-${randomUUID()}`,
			email,
			roles: [],
			emailVerified: false,
		};
		accounts.set(email, account);
		const code = await requestVerificationCode(email);
		const response = await requestAs(
			'post',
			'/users/profile',
			account,
		).send({
			name: 'E2E Ada',
			email,
			code,
		});

		expect(response.status).toBe(201);
		expect(response.body).toMatchObject({
			email,
			name: 'E2E Ada',
			active: true,
		});
		expect(account).toMatchObject({
			id: response.body.id,
			emailVerified: true,
			roles: [UserRole.USER],
		});
		expect(authPort.markEmailVerified).toHaveBeenCalledWith(
			account.subject,
		);
		expect(authPort.setUserClaims).toHaveBeenCalledWith({
			subject: account.subject,
			id: response.body.id,
			roles: [UserRole.USER],
		});
	});

	it('reconciles an existing email profile and permits retry after partial Firebase failure', async () => {
		const email = addEmail('reconcile');
		const localId = await createLocalUser(email);
		const account: TestAccount = {
			subject: `subject-${randomUUID()}`,
			email,
			roles: [],
			emailVerified: false,
		};
		accounts.set(email, account);
		const firstCode = await requestVerificationCode(email);
		authPort.markEmailVerified.mockRejectedValueOnce(
			new Error('Firebase offline'),
		);
		const failed = await requestAs('post', '/users/profile', account).send({
			name: 'Reconciled',
			email,
			code: firstCode,
		});
		expect(failed.status).toBe(500);
		const retryCode = await requestVerificationCode(email);
		const retried = await requestAs('post', '/users/profile', account).send(
			{
				name: 'Reconciled',
				email,
				code: retryCode,
			},
		);
		expect(retried.status).toBe(201);
		expect(retried.body.id).toBe(localId);
		expect(account.id).toBe(localId);
	});

	it('enforces bearer and ADMIN authorization and lists account existence', async () => {
		const adminEmail = addEmail('admin');
		const missingAccountEmail = addEmail('no-auth-account');
		const adminId = await createLocalUser(adminEmail);
		await createLocalUser(missingAccountEmail);
		const admin: TestAccount = {
			subject: `subject-${randomUUID()}`,
			id: adminId,
			email: adminEmail,
			roles: [UserRole.ADMIN],
			emailVerified: true,
		};
		const user: TestAccount = {
			subject: `subject-${randomUUID()}`,
			id: adminId,
			email: adminEmail,
			roles: [UserRole.USER],
			emailVerified: true,
		};
		accounts.set(adminEmail, admin);
		const unauthenticated = await request(app.getHttpServer()).get(
			'/users',
		);
		expect(unauthenticated.status).toBe(401);
		const denied = await requestAs('get', '/users', user).query({
			page: 1,
			perPage: 100,
		});
		expect(denied.status).toBe(403);
		const listed = await requestAs('get', '/users', admin).query({
			page: 1,
			perPage: 100,
		});
		expect(listed.status).toBe(200);
		expect(listed.body).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					email: adminEmail,
					authAccountExists: true,
				}),
				expect.objectContaining({
					email: missingAccountEmail,
					authAccountExists: false,
				}),
			]),
		);
	});

	it('updates profile, roles and active status through the administrative routes', async () => {
		const adminEmail = addEmail('mutation-admin');
		const targetEmail = addEmail('mutation-target');
		const adminId = await createLocalUser(adminEmail);
		const targetId = await createLocalUser(targetEmail);
		const admin: TestAccount = {
			subject: `subject-${randomUUID()}`,
			id: adminId,
			email: adminEmail,
			roles: [UserRole.ADMIN],
			emailVerified: true,
		};
		const target: TestAccount = {
			subject: `subject-${randomUUID()}`,
			id: targetId,
			email: targetEmail,
			roles: [UserRole.USER],
			emailVerified: true,
		};
		accounts.set(adminEmail, admin);
		accounts.set(targetEmail, target);

		const ownProfile = await requestAs(
			'patch',
			'/users/profile',
			admin,
		).send({ name: 'Renamed Admin' });
		expect(ownProfile.status).toBe(200);
		expect(ownProfile.body.name).toBe('Renamed Admin');

		const roles = await requestAs(
			'patch',
			`/users/${targetId}/roles`,
			admin,
		).send({ roles: [UserRole.USER, UserRole.COLLABORATOR] });
		expect(roles.status).toBe(200);
		expect(target.roles).toEqual([UserRole.USER, UserRole.COLLABORATOR]);
		expect(authPort.revokeSessions).toHaveBeenCalledWith(target.subject);

		const disabled = await requestAs(
			'patch',
			`/users/${targetId}/status`,
			admin,
		).send({ active: false });
		expect(disabled.status).toBe(200);
		expect(disabled.body.active).toBe(false);
		expect(target.disabled).toBe(true);

		const enabled = await requestAs(
			'patch',
			`/users/${targetId}/status`,
			admin,
		).send({ active: true });
		expect(enabled.status).toBe(200);
		expect(enabled.body.active).toBe(true);
		expect(target.disabled).toBe(false);
	});

	it('rejects a Firebase-active actor whose local profile is inactive', async () => {
		const email = addEmail('inactive-admin');
		const id = await createLocalUser(email, false);
		const actor: TestAccount = {
			subject: `subject-${randomUUID()}`,
			id,
			email,
			roles: [UserRole.ADMIN],
			emailVerified: true,
		};
		accounts.set(email, actor);

		const response = await requestAs('get', '/users', actor);
		expect(response.status).toBe(403);
	});

	it('serializes concurrent removal attempts so one active administrator remains', async () => {
		for (const account of accounts.values()) {
			if (account.roles.includes(UserRole.ADMIN))
				account.roles = [UserRole.USER];
		}
		const firstEmail = addEmail('race-admin-a');
		const secondEmail = addEmail('race-admin-b');
		const firstId = await createLocalUser(firstEmail);
		const secondId = await createLocalUser(secondEmail);
		const first: TestAccount = {
			subject: `subject-${randomUUID()}`,
			id: firstId,
			email: firstEmail,
			roles: [UserRole.ADMIN],
			emailVerified: true,
		};
		const second: TestAccount = {
			subject: `subject-${randomUUID()}`,
			id: secondId,
			email: secondEmail,
			roles: [UserRole.ADMIN],
			emailVerified: true,
		};
		accounts.set(firstEmail, first);
		accounts.set(secondEmail, second);
		const firstResponse = requestAs(
			'patch',
			`/users/${firstId}/roles`,
			first,
		).send({ roles: [UserRole.USER] });
		const secondResponse = requestAs(
			'patch',
			`/users/${secondId}/roles`,
			first,
		).send({ roles: [UserRole.USER] });
		const responses = await Promise.all([firstResponse, secondResponse]);

		expect(
			responses.map(({ status }) => status).sort((a, b) => a - b),
		).toEqual([200, 400]);
	});
});
