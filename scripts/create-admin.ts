import { stdin as input, stdout as output } from 'node:process';
import { emitKeypressEvents, type Key } from 'node:readline';
import * as readline from 'node:readline/promises';

import * as dotenv from 'dotenv';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type UserRecord } from 'firebase-admin/auth';

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
	console.log('--- Criador de Administrador (Apenas Firebase) ---');

	try {
		setupFirebase();

		const name = await rl.question('Nome completo: ');
		const email = await rl.question('E-mail: ');
		const password = await questionWithoutEcho(
			'Senha (min 12 caracteres): ',
		);
		rl = readline.createInterface({ input, output });
		if (password.length < 12) {
			throw new Error('Password must contain at least 12 characters');
		}
		const phoneInput = (
			await rl.question(
				'Telefone em formato internacional, opcional (ex: +15555550100): ',
			)
		).trim();
		if (phoneInput && !/^\+[1-9]\d{6,14}$/.test(phoneInput)) {
			throw new Error(
				'Phone number must use the international E.164 format, e.g. +15555550100',
			);
		}
		const phoneNumber = phoneInput || undefined;

		console.log('\nProcessando...');

		// 1. Verificar/Criar no Firebase
		let userRecord: UserRecord;
		try {
			userRecord = await getAuth().getUserByEmail(email);
			console.log(
				`Usuário Firebase já existe (UID: ${userRecord.uid}). Atualizando roles...`,
			);

			// Se o usuário já existe, atualizamos os dados básicos
			await getAuth().updateUser(userRecord.uid, {
				displayName: name,
				password: password || undefined,
				phoneNumber,
			});
		} catch (e: unknown) {
			const authError = e as { code?: string };
			if (authError?.code === 'auth/user-not-found') {
				userRecord = await getAuth().createUser({
					email,
					password,
					displayName: name,
					phoneNumber,
				});
				console.log(
					`Usuário criado no Firebase (UID: ${userRecord.uid})`,
				);
			} else {
				throw e;
			}
		}

		// 2. Setar Custom Claims (Role Administrador)
		await getAuth().setCustomUserClaims(userRecord.uid, {
			roles: ['ADMINISTRATOR'],
		});

		console.log(
			'✅ Roles de ADMINISTRATOR configuradas no Firebase com sucesso.',
		);
		console.log(`ID (UID): ${userRecord.uid}`);
		console.log('\nNota: Este administrador existe apenas no Firebase.');
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		console.error('\n❌ Erro:', message);
		process.exitCode = 1;
	} finally {
		rl.close();
	}
}

main().catch((err: unknown) => {
	console.error('Failed to run main:', err);
	process.exitCode = 1;
});
