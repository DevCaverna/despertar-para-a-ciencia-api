import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

import { InjectRedis } from '@nestjs-modules/ioredis';
import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { Redis } from 'ioredis';
import { I18nService } from 'nestjs-i18n';

import { AuthService } from '../auth/application/auth.service.js';
import type { AuthUser } from '../auth/domain/auth.types.js';
import { UserRole } from '../auth/domain/user-role.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';
import { MailService } from '../mail/application/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateProfileDto } from './dto/create-profile.dto.js';
import type { User } from './models/user.model.js';

@Injectable()
export class UserService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly auth: AuthService,
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

		let user = await this.prisma.database.orm.public.User.where({
			email: actorEmail,
		}).first();
		if (!user) {
			await this.verifyEmailCode(actorEmail, code);
			try {
				user = await this.prisma.database.orm.public.User.create({
					name,
					email: actorEmail,
				});
			} catch {
				user = await this.prisma.database.orm.public.User.where({
					email: actorEmail,
				}).first();
				if (!user) {
					throw new ConflictException(
						this.i18n.t('errors.PROFILE_CREATION_FAILED'),
					);
				}
			}
		}

		await this.auth.setUserClaims({
			firebaseUid: actor.firebaseUid,
			id: user.id,
			roles: actor.roles.length > 0 ? actor.roles : [UserRole.USER],
		});
		return user;
	}

	async sendEmailVerificationCode(email: string): Promise<void> {
		const exists = await this.prisma.database.orm.public.User.where({
			email,
		}).first();
		if (exists) {
			throw new ConflictException(
				this.i18n.t('errors.EMAIL_ALREADY_REGISTERED'),
			);
		}

		const code = randomInt(100_000, 1_000_000).toString();
		const expiresAt = Date.now() + 10 * 60_000;
		await Promise.all([
			this.redis.setex(
				this.emailVerificationKey(email),
				10 * 60,
				JSON.stringify({
					codeHash: this.hashVerificationCode(code),
					expiresAt,
				}),
			),
			this.redis.setex(
				this.emailVerificationAttemptsKey(email),
				10 * 60,
				'0',
			),
		]);

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
	): Promise<Array<User & { roles: UserRole[] }>> {
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
		return Promise.all(
			users.map(async (user) => ({
				...user,
				roles:
					(await this.auth.getUserByEmail(user.email))?.roles ?? [],
			})),
		);
	}

	async updateRoles(
		actor: AuthUser,
		userId: string,
		roles: UserRole[],
	): Promise<User> {
		await this.requireProfile(actor);
		const user = await this.requireUser(userId);
		const firebaseUser = await this.auth.getUserByEmail(user.email);
		if (!firebaseUser) {
			throw new ConflictException(
				this.i18n.t('errors.FIREBASE_ACCOUNT_NOT_FOUND'),
			);
		}

		const normalizedRoles = [...new Set(roles)];
		if (
			firebaseUser.roles.includes(UserRole.ADMIN) &&
			!normalizedRoles.includes(UserRole.ADMIN) &&
			(await this.countActiveAdministrators()) <= 1
		) {
			throw new BadRequestException(
				this.i18n.t('errors.LAST_ACTIVE_ADMINISTRATOR'),
			);
		}

		await this.auth.setUserClaims({
			firebaseUid: firebaseUser.firebaseUid,
			id: user.id,
			roles: normalizedRoles,
		});
		await this.auth.revokeSessions(firebaseUser.firebaseUid);
		return user;
	}

	async updateStatus(
		actor: AuthUser,
		userId: string,
		active: boolean,
	): Promise<User> {
		await this.requireProfile(actor);
		const user = await this.requireUser(userId);
		const firebaseUser = await this.auth.getUserByEmail(user.email);
		if (!firebaseUser) {
			throw new ConflictException(
				this.i18n.t('errors.FIREBASE_ACCOUNT_NOT_FOUND'),
			);
		}

		if (
			!active &&
			firebaseUser.roles.includes(UserRole.ADMIN) &&
			(await this.countActiveAdministrators()) <= 1
		) {
			throw new BadRequestException(
				this.i18n.t('errors.LAST_ACTIVE_ADMINISTRATOR'),
			);
		}

		await this.auth.setUserDisabled(firebaseUser.firebaseUid, !active);
		let updated: User | null;
		try {
			updated = await this.prisma.database.orm.public.User.where({
				id: user.id,
			}).update({ active, updatedAt: new Date().toISOString() });
		} catch (error) {
			await this.auth.setUserDisabled(
				firebaseUser.firebaseUid,
				!user.active,
			);
			throw error;
		}
		if (!updated) {
			await this.auth.setUserDisabled(
				firebaseUser.firebaseUid,
				!user.active,
			);
			throw new NotFoundException(this.i18n.t('errors.NOT_FOUND'));
		}
		await this.auth.revokeSessions(firebaseUser.firebaseUid);
		return updated;
	}

	private async requireProfile(actor: AuthUser): Promise<User> {
		if (!actor.id)
			throw new NotFoundException(this.i18n.t('errors.NOT_FOUND'));
		const user = await this.prisma.database.orm.public.User.first({
			id: actor.id,
		});
		if (!user) throw new NotFoundException(this.i18n.t('errors.NOT_FOUND'));
		return user;
	}

	private async verifyEmailCode(email: string, code: string): Promise<void> {
		const key = this.emailVerificationKey(email);
		const rawVerification = await this.redis.get(key);
		let verification: { codeHash: string; expiresAt: number } | undefined;
		try {
			const parsed: unknown = rawVerification
				? JSON.parse(rawVerification)
				: undefined;
			if (
				typeof parsed === 'object' &&
				parsed !== null &&
				typeof (parsed as { codeHash?: unknown }).codeHash ===
					'string' &&
				typeof (parsed as { expiresAt?: unknown }).expiresAt ===
					'number'
			) {
				verification = parsed as {
					codeHash: string;
					expiresAt: number;
				};
			}
		} catch {
			verification = undefined;
		}

		const attemptsKey = this.emailVerificationAttemptsKey(email);
		const attempts = Number((await this.redis.get(attemptsKey)) ?? 0);
		if (
			!verification ||
			attempts >= 5 ||
			verification.expiresAt <= Date.now()
		) {
			throw new BadRequestException(
				this.i18n.t('errors.EMAIL_VERIFICATION_CODE_INVALID'),
			);
		}

		const expectedHash = Buffer.from(verification.codeHash, 'hex');
		const suppliedHash = Buffer.from(
			this.hashVerificationCode(code),
			'hex',
		);
		if (
			expectedHash.length !== suppliedHash.length ||
			!timingSafeEqual(expectedHash, suppliedHash)
		) {
			const nextAttempts = await this.redis.incr(attemptsKey);
			if (nextAttempts === 1) {
				await this.redis.expire(
					attemptsKey,
					Math.max(
						1,
						Math.ceil((verification.expiresAt - Date.now()) / 1000),
					),
				);
			}
			if (nextAttempts >= 5) await this.redis.del(key, attemptsKey);
			throw new BadRequestException(
				this.i18n.t('errors.EMAIL_VERIFICATION_CODE_INVALID'),
			);
		}

		await this.redis.del(key, attemptsKey);
	}

	private emailVerificationKey(email: string): string {
		return `email-verification-code:${email}`;
	}

	private emailVerificationAttemptsKey(email: string): string {
		return `${this.emailVerificationKey(email)}:attempts`;
	}

	private hashVerificationCode(code: string): string {
		return createHash('sha256').update(code).digest('hex');
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
		const firebaseUsers = await Promise.all(
			users.map((user) => this.auth.getUserByEmail(user.email)),
		);
		return firebaseUsers.filter((user) =>
			user?.roles.includes(UserRole.ADMIN),
		).length;
	}
}
