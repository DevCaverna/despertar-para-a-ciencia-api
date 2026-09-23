import { stdin as input, stdout as output } from 'node:process';
import { emitKeypressEvents, type Key } from 'node:readline';
import * as readline from 'node:readline/promises';

import * as dotenv from 'dotenv';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type UserRecord } from 'firebase-admin/auth';

import { UserRole } from '../src/auth/domain/user-role.js';
import { createPrismaDatabase, createPrismaPool } from '../src/prisma/db.js';

dotenv.config();

let rl = readline.createInterface({ input, output });

async function questionWithoutEcho(prompt: string): Promise<string> {
	if (!input.isTTY || !output.isTTY || !input.setRawMode) {
		throw new Error('Password prompt requires an interactive TTY');
	}

	rl.close();
	emitKeypressEvents(input);
	output.write(prompt);
	input.setRawMode(true);
	input.resume();

	return new Promise<string>((resolve, reject) => {
		let value = '';

		const cleanup = (): void => {
			input.off('keypress', onKeypress);
			input.setRawMode(false);
			input.pause();
			output.write('\n');
		};

		const onKeypress = (str: string, key: Key): void => {
			if (key.ctrl && key.name === 'c') {
				cleanup();
				reject(new Error('Password prompt interrupted'));
				return;
			}
			if (key.name === 'return' || key.name === 'enter') {
				cleanup();
				resolve(value);
				return;
			}
			if (key.name === 'backspace') {
				const characters = Array.from(value);
				if (characters.length > 0) {
					characters.pop();
					value = characters.join('');
					output.write('\b \b');
				}
				return;
			}
			if (key.name === 'delete' || key.ctrl || key.meta || !str) {
				return;
			}

			value += str;
			output.write('*'.repeat(Array.from(str).length));
		};

		input.on('keypress', onKeypress);
	});
}

function setupFirebase(): void {
	const projectId = process.env.FIREBASE_PROJECT_ID;
	const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
	const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

	if (!projectId || !privateKey || !clientEmail) {
		throw new Error('Firebase credentials missing in .env');
	}

	if (getApps().length === 0) {
		initializeApp({
			credential: cert({
				projectId,
				privateKey,
				clientEmail,
			}),
		});
	}
}

async function main(): Promise<void> {
	console.log('--- Criador de Administrador ---');
	let pool: ReturnType<typeof createPrismaPool> | undefined;
	let database: ReturnType<typeof createPrismaDatabase> | undefined;

	try {
		setupFirebase();

		const name = (await rl.question('Nome completo: ')).trim();
		const email = (await rl.question('E-mail: ')).trim().toLowerCase();
		if (!name || !email) {
			throw new Error('Name and email are required');
		}
		if (!process.env.DATABASE_URL) {
			throw new Error('DATABASE_URL is required');
		}

		console.log('\nProcessando...');

		let userRecord: UserRecord;
		try {
			userRecord = await getAuth().getUserByEmail(email);
			console.log('Usuário Firebase já existe.');
		} catch (e: unknown) {
			const authError = e as { code?: string };
			if (authError?.code === 'auth/user-not-found') {
				const password = await questionWithoutEcho(
					'Senha inicial (min 12 caracteres): ',
				);
				rl = readline.createInterface({ input, output });
				if (password.length < 12) {
					throw new Error(
						'Password must contain at least 12 characters',
						{
							cause: e,
						},
					);
				}
				userRecord = await getAuth().createUser({
					email,
					password,
					displayName: name,
					emailVerified: true,
				});
				console.log('Usuário criado no Firebase.');
			} else {
				throw e;
			}
		}
		if (!userRecord.emailVerified) {
			throw new Error(
				'The Firebase administrator email must be verified',
			);
		}

		pool = createPrismaPool(process.env.DATABASE_URL);
		database = createPrismaDatabase(pool);
		let profile = await database.orm.public.User.where({ email }).first();
		if (!profile) {
			profile = await database.orm.public.User.create({ name, email });
		}

		await getAuth().setCustomUserClaims(userRecord.uid, {
			...userRecord.customClaims,
			id: profile.id,
			roles: [
				...new Set([
					...(Array.isArray(userRecord.customClaims?.roles)
						? userRecord.customClaims.roles.filter(
								(role): role is UserRole =>
									typeof role === 'string' &&
									Object.values(UserRole).includes(
										role as UserRole,
									),
							)
						: []),
					UserRole.ADMIN,
				]),
			],
		});

		console.log('Administrador reconciliado no Firebase e PostgreSQL.');
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		console.error('\n❌ Erro:', message);
		process.exitCode = 1;
	} finally {
		rl.close();
		if (database) await database.close();
		if (pool) await pool.end();
	}
}

main().catch((err: unknown) => {
	console.error('Failed to run main:', err);
	process.exitCode = 1;
});
