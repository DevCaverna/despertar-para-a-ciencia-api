import { randomUUID } from 'node:crypto';

import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { VERIFY_EMAIL_CODE_SCRIPT } from '../src/user/verify-email-code.script.js';

describe('email verification Redis script (e2e)', () => {
	let redis: Redis;
	const keys = (runId: string): [string, string] => [
		`test:email-verification:${runId}`,
		`test:email-verification:${runId}:attempts`,
	];

	beforeAll(() => {
		redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
	});

	afterAll(async () => {
		await redis.quit();
	});

	it('consumes a valid code only once under concurrent requests', async () => {
		const [verificationKey, attemptsKey] = keys(randomUUID());
		const expectedHash = 'a'.repeat(64);
		await redis.setex(
			verificationKey,
			600,
			JSON.stringify({
				codeHash: expectedHash,
				expiresAt: Date.now() + 600_000,
			}),
		);
		await redis.setex(attemptsKey, 600, '0');

		const results = await Promise.all(
			Array.from({ length: 20 }, () =>
				redis.eval(
					VERIFY_EMAIL_CODE_SCRIPT,
					2,
					verificationKey,
					attemptsKey,
					expectedHash,
					Date.now(),
					5,
				),
			),
		);

		expect(results.filter((result) => result === 1)).toHaveLength(1);
		expect(await redis.exists(verificationKey, attemptsKey)).toBe(0);
	});

	it('removes the code after five invalid attempts', async () => {
		const [verificationKey, attemptsKey] = keys(randomUUID());
		await redis.setex(
			verificationKey,
			600,
			JSON.stringify({
				codeHash: 'b'.repeat(64),
				expiresAt: Date.now() + 600_000,
			}),
		);
		await redis.setex(attemptsKey, 600, '0');

		for (let attempt = 0; attempt < 5; attempt += 1) {
			// oxlint-disable-next-line no-await-in-loop -- Increment failed attempts deterministically.
			await expect(
				redis.eval(
					VERIFY_EMAIL_CODE_SCRIPT,
					2,
					verificationKey,
					attemptsKey,
					'a'.repeat(64),
					Date.now(),
					5,
				),
			).resolves.toBe(0);
		}

		expect(await redis.exists(verificationKey, attemptsKey)).toBe(0);
	});

	it('rejects expired verification records and removes their attempt count', async () => {
		const [verificationKey, attemptsKey] = keys(randomUUID());
		await redis.setex(
			verificationKey,
			600,
			JSON.stringify({
				codeHash: 'c'.repeat(64),
				expiresAt: Date.now() - 1,
			}),
		);
		await redis.setex(attemptsKey, 600, '2');

		await expect(
			redis.eval(
				VERIFY_EMAIL_CODE_SCRIPT,
				2,
				verificationKey,
				attemptsKey,
				'c'.repeat(64),
				Date.now(),
				5,
			),
		).resolves.toBe(0);
		expect(await redis.exists(verificationKey, attemptsKey)).toBe(0);
	});
});
