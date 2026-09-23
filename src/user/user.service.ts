import { createHash, randomInt, randomUUID } from 'node:crypto';

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

const verifyEmailCodeScript = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local verification = cjson.decode(raw)
if verification.expiresAt <= tonumber(ARGV[2]) or verification.attempts >= 5 then
  redis.call('DEL', KEYS[1])
  return 0
end
if verification.codeHash == ARGV[1] then
  redis.call('DEL', KEYS[1])
  return 1
end
verification.attempts = verification.attempts + 1
if verification.attempts >= 5 then
  redis.call('DEL', KEYS[1])
  return 0
end
local ttl = redis.call('TTL', KEYS[1])
if ttl < 1 then return 0 end
redis.call('SETEX', KEYS[1], ttl, cjson.encode(verification))
return 0
`;
const releaseAdminMutationLockScript = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;
const renewAdminMutationLockScript = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0
`;

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
		await this.redis.setex(
			this.emailVerificationKey(email),
			10 * 60,
			JSON.stringify({
				codeHash: this.hashVerificationCode(code),
				attempts: 0,
				expiresAt,
			}),
		);

		await this.mail.sendTextEmail({
			to: [{ email }],
			subject: this.i18n.t('emails.EMAIL_VERIFICATION_SUBJECT'),
			textContent: this.i18n.t('emails.EMAIL_VERIFICATION_BODY', {
				args: { code },
			}),
		});
	}

	getProfile(actor: AuthUser): Promise<User> {
		return this.requireActiveProfile(actor);
	}

	async updateProfile(actor: AuthUser, name: string): Promise<User> {
		const user = await this.requireActiveProfile(actor);
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
		await this.requireActiveProfile(actor);
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
		await this.requireActiveProfile(actor);
		return this.withAdminMutationLock(async () => {
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
		});
	}

	async updateStatus(
		actor: AuthUser,
		userId: string,
		active: boolean,
	): Promise<User> {
		await this.requireActiveProfile(actor);
		return this.withAdminMutationLock(async () => {
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
		});
	}

	private async requireActiveProfile(actor: AuthUser): Promise<User> {
		if (!actor.id)
			throw new NotFoundException(this.i18n.t('errors.NOT_FOUND'));
		const user = await this.prisma.database.orm.public.User.first({
			id: actor.id,
		});
		if (!user) throw new NotFoundException(this.i18n.t('errors.NOT_FOUND'));
		if (!user.active)
			throw new ForbiddenException(
				this.i18n.t('errors.PROFILE_INACTIVE'),
			);
		return user;
	}

	private async verifyEmailCode(email: string, code: string): Promise<void> {
		const verified = Number(
			await this.redis.eval(
				verifyEmailCodeScript,
				1,
				this.emailVerificationKey(email),
				this.hashVerificationCode(code),
				Date.now().toString(),
			),
		);
		if (verified !== 1) {
			throw new BadRequestException(
				this.i18n.t('errors.EMAIL_VERIFICATION_CODE_INVALID'),
			);
		}
	}

	private emailVerificationKey(email: string): string {
		return `email-verification-code:${email}`;
	}

	private async withAdminMutationLock<T>(
		operation: () => Promise<T>,
	): Promise<T> {
		const token = randomUUID();
		const acquired = await this.redis.set(
			'users:admin-mutation-lock',
			token,
			'PX',
			30_000,
			'NX',
		);
		if (acquired !== 'OK') {
			throw new ConflictException(
				this.i18n.t('errors.ADMIN_OPERATION_IN_PROGRESS'),
			);
		}

		const refreshTimer = setInterval(() => {
			void this.redis.eval(
				renewAdminMutationLockScript,
				1,
				'users:admin-mutation-lock',
				token,
				'30000',
			);
		}, 10_000);
		refreshTimer.unref();

		try {
			return await operation();
		} finally {
			clearInterval(refreshTimer);
			await this.redis.eval(
				releaseAdminMutationLockScript,
				1,
				'users:admin-mutation-lock',
				token,
			);
		}
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
