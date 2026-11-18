import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import { createPrismaPool } from '../../src/prisma/db.js';

export async function createIsolatedDatabase(): Promise<{
	url: string;
	dispose: () => Promise<void>;
}> {
	const sourceUrl = process.env.DATABASE_URL;
	if (!sourceUrl) throw new Error('DATABASE_URL must be set');
	// Only a generated identifier is interpolated into administrative DDL.
	const name = `posts_e2e_${randomUUID().replaceAll('-', '')}`;
	const admin = createPrismaPool(sourceUrl);
	const url = new URL(sourceUrl);
	url.pathname = `/${name}`;
	const dispose = async (): Promise<void> => {
		try {
			await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
		} finally {
			await admin.end();
		}
	};
	try {
		await admin.query(`CREATE DATABASE "${name}" TEMPLATE template0`);
		for (const command of ['migrate', 'verify']) {
			execFileSync(
				'pnpm',
				['prisma', 'db', command, '--db', url.toString()],
				{
					cwd: process.cwd(),
					env: { ...process.env, DATABASE_URL: url.toString() },
					stdio: 'pipe',
				},
			);
		}
		return { url: url.toString(), dispose };
	} catch (error) {
		await dispose();
		throw error;
	}
}
