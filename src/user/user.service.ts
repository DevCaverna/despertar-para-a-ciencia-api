import { createHmac, randomInt } from 'node:crypto';

import { InjectRedis } from '@nestjs-modules/ioredis';
import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	Logger,
	NotFoundException,
	ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { I18nService } from 'nestjs-i18n';

import { AuthService } from '../auth/application/auth.service.js';
import type { AuthUser } from '../auth/domain/auth.types.js';
import { UserRole } from '../auth/domain/user-role.js';
import type { AppConfig } from '../config/config.types.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';
import { MailService } from '../mail/application/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateProfileDto } from './dto/create-profile.dto.js';
import type { User } from './models/user.model.js';
import { VERIFY_EMAIL_CODE_SCRIPT } from './verify-email-code.script.js';

const FIREBASE_BATCH_SIZE = 10;

@Injectable()
export class UserService {
	private administrativeMutation = Promise.resolve();
	private readonly logger = new Logger(UserService.name);

	constructor(
		private readonly prisma: PrismaService,
		private readonly auth: AuthService,
		private readonly config: ConfigService<AppConfig, true>,
		private readonly i18n: I18nService<I18nTranslations>,
		private readonly mail: MailService,
		@InjectRedis() private readonly redis: Redis,
	) {}

	async createProfile(
		actor: AuthUser,
		{ name, email, code }: CreateProfileDto,
	): Promise<User> {
		const actorEmail = actor.email.trim().toLowerCase();
		if (actorEmail !== email) {
			throw new ForbiddenException(
				this.i18n.t('errors.PROFILE_EMAIL_MISMATCH'),
			);
		}

		if (actor.id) {
			const user = await this.prisma.database.orm.public.User.first({
				id: actor.id,
			});
			if (user) return user;
			throw new ConflictException(
				this.i18n.t('errors.PROFILE_CLAIM_INVALID'),
			);
		}

		await this.verifyEmailCode(actorEmail, code);
		let user = await this.prisma.database.orm.public.User.where({
			email: actorEmail,
		}).first();
		if (!user) {
			try {
				user = await this.prisma.database.orm.public.User.create({
					name,
					email: actorEmail,
				});
			} catch (error) {
				if (!this.isEmailUniqueViolation(error)) throw error;
				user = await this.prisma.database.orm.public.User.where({
					email: actorEmail,
				}).first();
				if (!user) {
					throw error;
				}
			}
		}

		await this.auth.markEmailVerified(actor.subject);
		await this.auth.setUserClaims({
			subject: actor.subject,
			id: user.id,
			roles: actor.roles.length > 0 ? actor.roles : [UserRole.USER],
		});
		return user;
	}

	async sendEmailVerificationCode(email: string): Promise<void> {
		const code = randomInt(100_000, 1_000_000).toString();
		const expiresAt = Date.now() + 10 * 60_000;
		await this.redis
			.multi()
			.setex(
				this.emailVerificationKey(email),
				10 * 60,
				JSON.stringify({
					codeHash: this.hashVerificationCode(code),
					expiresAt,
				}),
			)
			.setex(this.emailVerificationAttemptsKey(email), 10 * 60, '0')
			.exec();

		await this.mail.sendTextEmail({
			to: [{ email }],
			subject: this.i18n.t('emails.EMAIL_VERIFICATION_SUBJECT'),
			textContent: this.i18n.t('emails.EMAIL_VERIFICATION_BODY', {
				args: { code },
			}),
		});
	}

	getProfile(actor: AuthUser): Promise<User> {
		return this.requireProfile(actor);
	}

	async updateProfile(actor: AuthUser, name: string): Promise<User> {
		const user = await this.requireProfile(actor);
		const updated = await this.prisma.database.orm.public.User.where({
			id: user.id,
		}).update({
			name,
			updatedAt: new Date().toISOString(),
		});
		if (!updated)
			throw new NotFoundException(this.i18n.t('errors.NOT_FOUND'));
		return updated;
	}

	async listUsers(
		actor: AuthUser,
		page: number,
		perPage: number,
	): Promise<
		Array<User & { roles: UserRole[]; authAccountExists: boolean }>
	> {
		await this.requireProfile(actor);
		const users: User[] = [];
		for await (const row of this.prisma.database.orm.public.User.orderBy(
			(user) => user.createdAt.desc(),
		)
			.offset((page - 1) * perPage)
			.limit(perPage)
			.all()) {
			users.push(row);
		}
		return this.mapUsersWithAuthAccounts(users);
	}

	async updateRoles(
		actor: AuthUser,
		userId: string,
		roles: UserRole[],
	): Promise<User> {
		await this.requireProfile(actor);
		const normalizedRoles = [...new Set(roles)];
		return this.withAdministrativeMutex(async () => {
			const user = await this.requireUser(userId);
			const authUser = await this.auth.getUserByEmail(user.email);
			if (!authUser) {
				throw new ConflictException(
					this.i18n.t('errors.AUTH_ACCOUNT_NOT_FOUND'),
				);
			}
			if (
				user.active &&
				authUser.roles.includes(UserRole.ADMIN) &&
				!normalizedRoles.includes(UserRole.ADMIN) &&
				(await this.countActiveAdministrators()) <= 1
			) {
				throw new BadRequestException(
					this.i18n.t('errors.LAST_ACTIVE_ADMINISTRATOR'),
				);
			}
			const removesRole = authUser.roles.some(
				(role) => !normalizedRoles.includes(role),
			);
			if (removesRole)
				await this.revokeSessionsWithRetry(authUser.subject);
			await this.auth.setUserClaims({
				subject: authUser.subject,
				id: user.id,
				roles: normalizedRoles,
			});
			if (!removesRole)
				await this.revokeSessionsWithRetry(authUser.subject);
			return user;
		});
	}

	async updateStatus(
		actor: AuthUser,
		userId: string,
		active: boolean,
	): Promise<User> {
		await this.requireProfile(actor);
		const user = await this.requireUser(userId);
		const authUser = await this.auth.getUserByEmail(user.email);
		if (!authUser) {
			throw new ConflictException(
				this.i18n.t('errors.AUTH_ACCOUNT_NOT_FOUND'),
			);
		}

		return this.withAdministrativeMutex(async () => {
			if (
				!active &&
				authUser.roles.includes(UserRole.ADMIN) &&
				(await this.countActiveAdministrators()) <= 1
			) {
				throw new BadRequestException(
					this.i18n.t('errors.LAST_ACTIVE_ADMINISTRATOR'),
				);
			}

			const setUserStatus = active
				? this.auth.enableUser.bind(this.auth)
				: this.auth.disableUser.bind(this.auth);
			await setUserStatus(authUser.subject);
			let updated: User | null;
			try {
				updated = await this.prisma.database.orm.public.User.where({
					id: user.id,
				}).update({ active, updatedAt: new Date().toISOString() });
			} catch (error) {
				await this.compensateStatusChange({
					authSubject: authUser.subject,
					userId: user.id,
					previousStatus: user.active,
					desiredStatus: active,
					primaryError: error,
				});
				throw error;
			}
			if (!updated) {
				const error = new NotFoundException(
					this.i18n.t('errors.NOT_FOUND'),
				);
				await this.compensateStatusChange({
					authSubject: authUser.subject,
					userId: user.id,
					previousStatus: user.active,
					desiredStatus: active,
					primaryError: error,
				});
				throw error;
			}
			await this.revokeSessionsWithRetry(authUser.subject);
			return updated;
		});
	}

	private async requireProfile(actor: AuthUser): Promise<User> {
		if (!actor.id)
			throw new NotFoundException(this.i18n.t('errors.NOT_FOUND'));
		const user = await this.prisma.database.orm.public.User.first({
			id: actor.id,
		});
		if (!user) throw new NotFoundException(this.i18n.t('errors.NOT_FOUND'));
		if (!user.active)
			throw new ForbiddenException(this.i18n.t('errors.FORBIDDEN'));
		return user;
	}

	private async verifyEmailCode(email: string, code: string): Promise<void> {
		const result = await this.redis.eval(
			VERIFY_EMAIL_CODE_SCRIPT,
			2,
			this.emailVerificationKey(email),
			this.emailVerificationAttemptsKey(email),
			this.hashVerificationCode(code),
			Date.now(),
			5,
		);
		if (result !== 1) {
			throw new BadRequestException(
				this.i18n.t('errors.EMAIL_VERIFICATION_CODE_INVALID'),
			);
		}
	}

	private emailVerificationKey(email: string): string {
		return `email-verification-code:${email}`;
	}

	private emailVerificationAttemptsKey(email: string): string {
		return `${this.emailVerificationKey(email)}:attempts`;
	}

	private hashVerificationCode(code: string): string {
		const secret = this.config.getOrThrow(
			'auth.firebase.emailVerificationHmacSecret',
			{ infer: true },
		);
		return createHmac('sha256', secret).update(code).digest('hex');
	}

	private async requireUser(id: string): Promise<User> {
		const user = await this.prisma.database.orm.public.User.first({ id });
		if (!user) throw new NotFoundException(this.i18n.t('errors.NOT_FOUND'));
		return user;
	}

	private async countActiveAdministrators(): Promise<number> {
		const users: User[] = [];
		for await (const user of this.prisma.database.orm.public.User.where({
			active: true,
		}).all()) {
			users.push(user);
		}
		const usersWithAccounts = await this.mapUsersWithAuthAccounts(users);
		return usersWithAccounts.filter((user) =>
			user.roles.includes(UserRole.ADMIN),
		).length;
	}

	private async mapUsersWithAuthAccounts(
		users: User[],
	): Promise<
		Array<User & { roles: UserRole[]; authAccountExists: boolean }>
	> {
		const results: Array<
			User & { roles: UserRole[]; authAccountExists: boolean }
		> = [];
		for (
			let offset = 0;
			offset < users.length;
			offset += FIREBASE_BATCH_SIZE
		) {
			const batch = users.slice(offset, offset + FIREBASE_BATCH_SIZE);
			let authUsers: Array<AuthUser | undefined>;
			try {
				// oxlint-disable-next-line no-await-in-loop -- Keep Firebase fan-out bounded to one batch at a time.
				authUsers = await Promise.all(
					batch.map((user) => this.auth.getUserByEmail(user.email)),
				);
			} catch (error) {
				this.logger.error({
					event: 'user_auth_listing_failed',
					'user.batch_size': batch.length,
					'error.type': this.errorType(error),
				});
				throw new ServiceUnavailableException(
					this.i18n.t('errors.AUTH_ACCOUNT_LOOKUP_UNAVAILABLE'),
				);
			}
			results.push(
				...batch.map((user, index) => ({
					...user,
					roles: authUsers[index]?.roles ?? [],
					authAccountExists: authUsers[index] !== undefined,
				})),
			);
		}
		return results;
	}

	private isEmailUniqueViolation(error: unknown): boolean {
		let current: unknown = error;
		while (typeof current === 'object' && current !== null) {
			const candidate = current as {
				code?: unknown;
				constraint?: unknown;
				cause?: unknown;
			};
			if (
				candidate.code === '23505' &&
				candidate.constraint === 'user_email_key'
			) {
				return true;
			}
			current = candidate.cause;
		}
		return false;
	}

	private async compensateStatusChange({
		authSubject,
		userId,
		previousStatus,
		desiredStatus,
		primaryError,
	}: {
		authSubject: string;
		userId: string;
		previousStatus: boolean;
		desiredStatus: boolean;
		primaryError: unknown;
	}): Promise<void> {
		try {
			await (previousStatus
				? this.auth.enableUser(authSubject)
				: this.auth.disableUser(authSubject));
		} catch (compensationError) {
			this.logger.error({
				event: 'user_status_compensation_failed',
				'user.id': userId,
				'auth.subject': authSubject,
				'auth.previous_status': previousStatus,
				'auth.desired_status': desiredStatus,
				'error.primary_type': this.errorType(primaryError),
				'error.compensation_type': this.errorType(compensationError),
			});
			throw new ServiceUnavailableException(
				this.i18n.t('errors.USER_STATUS_RECONCILIATION_REQUIRED'),
			);
		}
	}

	private errorType(error: unknown): string {
		return error instanceof Error ? error.constructor.name : 'UnknownError';
	}

	private async withAdministrativeMutex<T>(
		work: () => Promise<T>,
	): Promise<T> {
		const previous = this.administrativeMutation;
		let release!: () => void;
		this.administrativeMutation = new Promise<void>((resolve) => {
			release = resolve;
		});
		await previous;
		try {
			return await work();
		} finally {
			release();
		}
	}

	private async revokeSessionsWithRetry(subject: string): Promise<void> {
		for (let attempt = 0; attempt < 2; attempt += 1) {
			try {
				// The second attempt must wait for the first result.
				// oxlint-disable-next-line no-await-in-loop
				await this.auth.revokeSessions(subject);
				return;
			} catch {}
		}
		throw new ServiceUnavailableException(
			this.i18n.t('errors.SESSION_REVOCATION_PENDING'),
		);
	}
}
