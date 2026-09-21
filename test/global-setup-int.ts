import { execFileSync } from 'node:child_process';
import path from 'node:path';

import dotenv from 'dotenv';

export default function globalSetup(): void {
	// Carrega variáveis de ambiente do .env.test (se existir)
	dotenv.config({
		path: path.resolve(process.cwd(), '.env.test'),
		quiet: true,
	});

	console.log('\n🔄 Applying Prisma migrations for integration tests...');

	execFileSync(
		'pnpm',
		['prisma', 'migration', 'status', '--db', process.env.DATABASE_URL!],
		{
			cwd: process.cwd(),
			stdio: 'pipe',
			env: {
				...process.env,
				DATABASE_URL: process.env.DATABASE_URL,
			},
		},
	);

	execFileSync(
		'pnpm',
		['prisma', 'db', 'migrate', '--db', process.env.DATABASE_URL!],
		{
			cwd: process.cwd(),
			stdio: 'pipe',
			env: {
				...process.env,
				DATABASE_URL: process.env.DATABASE_URL,
			},
		},
	);

	execFileSync(
		'pnpm',
		['prisma', 'db', 'verify', '--db', process.env.DATABASE_URL!],
		{
			cwd: process.cwd(),
			stdio: 'pipe',
			env: {
				...process.env,
				DATABASE_URL: process.env.DATABASE_URL,
			},
		},
	);

	console.log('✅ Database migrations applied.\n');
}
