import { resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';

import * as dotenv from 'dotenv';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type UserRecord } from 'firebase-admin/auth';

import { UserRole } from '../src/auth/domain/user-role.js';
import { PostStatus } from '../src/post/domain/post-status.js';
import {
	createPrismaDatabase,
	createPrismaPool,
	type PrismaDatabase,
} from '../src/prisma/db.js';

export interface DemoUserFixture {
	name: string;
	email: string;
	roles: readonly UserRole[];
}

export interface DemoSourceFixture {
	name: string;
	issn: string;
}

export interface DemoExternalWorkFixture {
	sourceIssn: string;
	doi: string;
	title: string;
	authors: string[];
	abstract: string | null;
	publicationDate: string;
	journal: string;
	url: string;
}

export interface DemoPostFixture {
	authorEmail: string;
	title: string;
	content: string;
	status: PostStatus;
	rejectionReason: string | null;
	publishedAt: string | null;
}

export interface EntitySeedCounts {
	created: number;
	skipped: number;
}

export interface SeedDemoSummary {
	users: EntitySeedCounts;
	sources: EntitySeedCounts;
	externalWorks: EntitySeedCounts;
	posts: EntitySeedCounts;
}

export const DEMO_USERS: readonly DemoUserFixture[] = [
	{
		name: 'Dra. Mariana Costa',
		email: 'admin.demo@example.com',
		roles: [UserRole.ADMIN],
	},
	{
		name: 'Prof. Lucas Mendes',
		email: 'colaborador.demo@example.com',
		roles: [UserRole.COLLABORATOR],
	},
	{
		name: 'Ana Souza',
		email: 'leitor.demo@example.com',
		roles: [UserRole.USER],
	},
];

export const DEMO_SOURCES: readonly DemoSourceFixture[] = [
	{
		name: 'Nature',
		issn: '0028-0836',
	},
	{
		name: 'Cadernos de Saúde Pública',
		issn: '0102-311X',
	},
];

export const DEMO_EXTERNAL_WORKS: readonly DemoExternalWorkFixture[] = [
	{
		sourceIssn: '0028-0836',
		doi: '10.1038/demo-2026-0001',
		title: 'Microbioma urbano e resiliência imunológica em áreas tropicais',
		authors: ['Marina Oliveira', 'Carlos Eduardo Santos'],
		abstract:
			'Estudo longitudinal que analisa a diversidade microbiana em parques urbanos e sua relação com indicadores imunológicos populacionais.',
		publicationDate: '2026-05-14',
		journal: 'Nature',
		url: 'https://doi.org/10.1038/demo-2026-0001',
	},
	{
		sourceIssn: '0102-311X',
		doi: '10.1590/demo-2026-0002',
		title: 'Monitoramento comunitário da qualidade da água em bacias periurbanas',
		authors: ['Fernanda Lima', 'João Pedro Ribeiro'],
		abstract:
			'Avaliação participativa de parâmetros físico-químicos e microbiológicos em pontos de captação comunitária ao longo de doze meses.',
		publicationDate: '2026-06-20',
		journal: 'Cadernos de Saúde Pública',
		url: 'https://doi.org/10.1590/demo-2026-0002',
	},
	{
		sourceIssn: '0028-0836',
		doi: '10.1038/demo-2026-0003',
		title: 'Catalogação histórica de acervos botânicos digitais sem resumo indexado',
		authors: ['Helena Martins'],
		abstract: null,
		publicationDate: '2026-04-02',
		journal: 'Nature',
		url: 'https://doi.org/10.1038/demo-2026-0003',
	},
];

export const DEMO_POSTS: readonly DemoPostFixture[] = [
	{
		authorEmail: 'colaborador.demo@example.com',
		title: 'Por que áreas verdes urbanas fortalecem a saúde pública',
		content:
			'Pesquisas recentes em ecologia urbana mostram que o contato regular com áreas arborizadas amplia a diversidade da microbiota benéfica e reduz respostas inflamatórias crônicas.',
		status: PostStatus.PUBLISHED,
		rejectionReason: null,
		publishedAt: '2026-10-10T14:00:00.000Z',
	},
	{
		authorEmail: 'admin.demo@example.com',
		title: 'Ciência cidadã no monitoramento de bacias hidrográficas',
		content:
			'Quando moradores e pesquisadores compartilham protocolos simples de coleta, o acompanhamento da qualidade da água ganha escala contínua e apoia decisões locais de saneamento.',
		status: PostStatus.PUBLISHED,
		rejectionReason: null,
		publishedAt: '2026-10-15T16:30:00.000Z',
	},
	{
		authorEmail: 'colaborador.demo@example.com',
		title: 'Como interpretar gráficos de incerteza em previsões climáticas',
		content:
			'Modelos climáticos não produzem uma única trajetória futura, mas intervalos probabilísticos que ajudam gestores a planejar adaptação de longo prazo.',
		status: PostStatus.PENDING_REVIEW,
		rejectionReason: null,
		publishedAt: null,
	},
	{
		authorEmail: 'colaborador.demo@example.com',
		title: 'Rascunho inicial sobre sensores de baixo custo em escolas',
		content:
			'Anotações iniciais para matéria explicando como estações meteorológicas escolares ajudam no ensino de física e geografia.',
		status: PostStatus.DRAFT,
		rejectionReason: null,
		publishedAt: null,
	},
	{
		authorEmail: 'colaborador.demo@example.com',
		title: 'Nota preliminar sobre vacinação sazonal',
		content:
			'Texto curto ainda sem contextualização das fontes oficiais nem explicação dos termos técnicos usados no estudo.',
		status: PostStatus.REJECTED,
		rejectionReason:
			'Incluir referência explícita aos dados epidemiológicos e revisar termos técnicos para linguagem acessível.',
		publishedAt: null,
	},
];

function summarize(results: readonly { created: boolean }[]): EntitySeedCounts {
	const created = results.filter((item) => item.created).length;
	return {
		created,
		skipped: results.length - created,
	};
}

/**
 * Prevents seeding fictional demonstration data into a production database.
 */
export function assertSafeSeedEnvironment(nodeEnv: string | undefined): void {
	if (nodeEnv?.trim() === 'production') {
		throw new Error(
			'Demonstração não pode ser executada com NODE_ENV=production.',
		);
	}
}

/**
 * Populates PostgreSQL idempotently with demo users, academic sources, external works, and posts.
 */
export async function seedDemoData(
	database: PrismaDatabase,
): Promise<SeedDemoSummary> {
	const userResults = await Promise.all(
		DEMO_USERS.map(async (fixture) => {
			const existing = await database.orm.public.User.where({
				email: fixture.email,
			}).first();
			if (existing) {
				return {
					email: fixture.email,
					id: existing.id,
					created: false,
				};
			}
			const created = await database.orm.public.User.create({
				name: fixture.name,
				email: fixture.email,
			});
			return { email: fixture.email, id: created.id, created: true };
		}),
	);
	const userIdByEmail = new Map(
		userResults.map((entry) => [entry.email, entry.id]),
	);

	const sourceResults = await Promise.all(
		DEMO_SOURCES.map(async (fixture) => {
			const existing = await database.orm.public.AcademicSource.where({
				issn: fixture.issn,
			}).first();
			if (existing) {
				return { issn: fixture.issn, id: existing.id, created: false };
			}
			const created = await database.orm.public.AcademicSource.create({
				name: fixture.name,
				issn: fixture.issn,
			});
			return { issn: fixture.issn, id: created.id, created: true };
		}),
	);
	const sourceIdByIssn = new Map(
		sourceResults.map((entry) => [entry.issn, entry.id]),
	);

	const workResults = await Promise.all(
		DEMO_EXTERNAL_WORKS.map(async (fixture) => {
			const existing = await database.orm.public.ExternalWork.where({
				doi: fixture.doi,
			}).first();
			if (existing) {
				return { doi: fixture.doi, created: false };
			}
			const sourceId = sourceIdByIssn.get(fixture.sourceIssn);
			if (!sourceId) {
				throw new Error(
					`Missing AcademicSource for ISSN ${fixture.sourceIssn}`,
				);
			}
			await database.orm.public.ExternalWork.create({
				sourceId,
				doi: fixture.doi,
				title: fixture.title,
				authors: fixture.authors,
				abstract: fixture.abstract,
				publicationDate: fixture.publicationDate,
				journal: fixture.journal,
				url: fixture.url,
			});
			return { doi: fixture.doi, created: true };
		}),
	);

	const postResults = await Promise.all(
		DEMO_POSTS.map(async (fixture) => {
			const authorId = userIdByEmail.get(fixture.authorEmail);
			if (!authorId) {
				throw new Error(
					`Missing demo author for email ${fixture.authorEmail}`,
				);
			}
			const existing = await database.orm.public.Post.where({
				authorId,
				title: fixture.title,
			}).first();
			if (existing) {
				return { title: fixture.title, created: false };
			}
			await database.orm.public.Post.create({
				authorId,
				title: fixture.title,
				content: fixture.content,
				status: fixture.status,
				rejectionReason: fixture.rejectionReason,
				publishedAt: fixture.publishedAt,
			});
			return { title: fixture.title, created: true };
		}),
	);

	return {
		users: summarize(userResults),
		sources: summarize(sourceResults),
		externalWorks: summarize(workResults),
		posts: summarize(postResults),
	};
}

async function reconcileEmulatorAccounts(
	database: PrismaDatabase,
	projectId: string,
	password: string,
): Promise<void> {
	if (getApps().length === 0) {
		initializeApp({ projectId });
	}
	const auth = getAuth();

	await Promise.all(
		DEMO_USERS.map(async (fixture) => {
			const profile = await database.orm.public.User.where({
				email: fixture.email,
			}).first();
			if (!profile) {
				throw new Error(
					`Demo profile not found for ${fixture.email} after seeding.`,
				);
			}

			let userRecord: UserRecord;
			try {
				userRecord = await auth.getUserByEmail(fixture.email);
			} catch (error: unknown) {
				const authError = error as { code?: string };
				if (authError?.code !== 'auth/user-not-found') {
					throw error;
				}
				userRecord = await auth.createUser({
					email: fixture.email,
					password,
					displayName: fixture.name,
					emailVerified: true,
				});
			}

			await auth.setCustomUserClaims(userRecord.uid, {
				...userRecord.customClaims,
				id: profile.id,
				roles: [...fixture.roles],
			});
		}),
	);
}

async function main(): Promise<void> {
	dotenv.config();
	assertSafeSeedEnvironment(process.env.NODE_ENV);

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error('DATABASE_URL is required');
	}

	const pool = createPrismaPool(databaseUrl);
	const database = createPrismaDatabase(pool);

	try {
		const summary = await seedDemoData(database);
		console.log('Seed de demonstração concluído:', summary);

		const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST?.trim();
		const demoPassword = process.env.DEMO_USER_PASSWORD;
		const projectId = process.env.FIREBASE_PROJECT_ID?.trim();

		if (emulatorHost && demoPassword) {
			if (demoPassword.length < 12) {
				throw new Error(
					'DEMO_USER_PASSWORD must contain at least 12 characters',
				);
			}
			if (!projectId) {
				throw new Error(
					'FIREBASE_PROJECT_ID is required to reconcile emulator accounts',
				);
			}
			await reconcileEmulatorAccounts(database, projectId, demoPassword);
			console.log(
				'Contas de demonstração reconciliadas no Firebase Auth Emulator.',
			);
		} else {
			console.log(
				'PostgreSQL populado. Para também criar logins de teste no Firebase Auth Emulator, defina FIREBASE_AUTH_EMULATOR_HOST e DEMO_USER_PASSWORD (>= 12 caracteres), ou use scripts/create-admin.ts.',
			);
		}
	} finally {
		await database.close();
		await pool.end();
	}
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(resolvePath(process.argv[1])).href
) {
	main().catch((error: unknown) => {
		const message = error instanceof Error ? error.message : String(error);
		console.error('Erro ao executar seed de demonstração:', message);
		process.exitCode = 1;
	});
}
