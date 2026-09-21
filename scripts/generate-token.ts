import { stdin as input, stdout as output } from 'node:process';
import * as readline from 'node:readline/promises';

import * as dotenv from 'dotenv';

dotenv.config();

const rl = readline.createInterface({ input, output });

interface FirebaseAuthResponse {
	idToken?: string;
	expiresIn?: string;
	error?: {
		message?: string;
	};
}

/**
 * Script para obter um ID Token (JWT) do Firebase usando e-mail e senha.
 *
 * Necessita da variável FIREBASE_WEB_API_KEY no arquivo .env.
 * Essa chave é encontrada no Console do Firebase > Configurações do Projeto > Chave de API da Web.
 */
async function main(): Promise<void> {
	console.log('--- Gerador de Token Firebase (ID Token) ---');

	const apiKey =
		process.env.FIREBASE_WEB_API_KEY || process.env.FIREBASE_API_KEY;

	if (!apiKey) {
		console.error(
			'\n❌ ERRO: FIREBASE_WEB_API_KEY não encontrada no arquivo .env',
		);
		console.log(
			'\nPara obter o token via CLI, você precisa da "Chave de API da Web".',
		);
		console.log('1. Vá ao Console do Firebase');
		console.log('2. Configurações do Projeto > Aba Geral');
		console.log(
			'3. Copie a "Chave de API da Web" e adicione ao .env como FIREBASE_WEB_API_KEY=...',
		);
		rl.close();
		process.exitCode = 1;
		return;
	}

	try {
		const email = await rl.question('E-mail: ');
		const password = await rl.question('Senha: ');

		console.log('\nAutenticando...');

		const response = await fetch(
			`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
			{
				method: 'POST',
				body: JSON.stringify({
					email,
					password,
					returnSecureToken: true,
				}),
				headers: { 'Content-Type': 'application/json' },
			},
		);

		const data = (await response.json()) as FirebaseAuthResponse;

		if (data.error) {
			throw new Error(data.error.message);
		}

		console.log('\n✅ Autenticação realizada com sucesso!');
		console.log('\n--- ID TOKEN (JWT) ---');
		console.log(data.idToken);
		console.log('\n--- EXPIRES IN ---');
		console.log(`${data.expiresIn} segundos`);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		console.error('\n❌ Erro na autenticação:', message);
	} finally {
		rl.close();
	}
}

main().catch((err: unknown) => {
	console.error('Failed to run main:', err);
	process.exitCode = 1;
});
