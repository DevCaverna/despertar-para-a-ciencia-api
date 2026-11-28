import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service.js';
import type { AcademicWorkCandidate } from '../application/academic-work-source.port.js';
import type {
	AcademicWorkModel,
	AcademicWorkPageModel,
} from '../models/academic-work.model.js';

const BATCH_SIZE = 100;

@Injectable()
export class AcademicWorkRepository {
	constructor(private readonly prisma: PrismaService) {}

	async list(page: number, perPage: number): Promise<AcademicWorkPageModel> {
		const items: AcademicWorkModel[] = [];
		for await (const work of this.prisma.database.orm.public.ExternalWork.orderBy(
			[(fields) => fields.createdAt.desc(), (fields) => fields.id.desc()],
		)
			.offset((page - 1) * perPage)
			.limit(perPage + 1)
			.select(
				'id',
				'doi',
				'title',
				'authors',
				'abstract',
				'publicationDate',
				'journal',
				'url',
			)
			.include('source', (source) => source.select('id', 'name', 'issn'))
			.all()) {
			items.push({
				...work,
				authors: [...work.authors],
				source: work.source!,
			});
		}
		return {
			items: items.slice(0, perPage),
			page,
			perPage,
			hasNextPage: items.length > perPage,
		};
	}

	async get(id: string): Promise<AcademicWorkModel | null> {
		const work = await this.prisma.database.orm.public.ExternalWork.where({
			id,
		})
			.select(
				'id',
				'doi',
				'title',
				'authors',
				'abstract',
				'publicationDate',
				'journal',
				'url',
			)
			.include('source', (source) => source.select('id', 'name', 'issn'))
			.first();
		return work
			? { ...work, authors: [...work.authors], source: work.source! }
			: null;
	}

	async importWorks(
		issn: string,
		name: string,
		candidates: readonly AcademicWorkCandidate[],
	): Promise<number> {
		const database = this.prisma.database;
		const worksByDoi = new Map<string, AcademicWorkCandidate>();
		for (const candidate of candidates) {
			if (!worksByDoi.has(candidate.externalId)) {
				worksByDoi.set(candidate.externalId, candidate);
			}
		}
		// Acquire DOI locks in the same order across concurrent imports.
		const works = [...worksByDoi.values()].sort((a, b) =>
			a.externalId < b.externalId ? -1 : 1,
		);

		return database.transaction(async (tx) => {
			const source = await tx.orm.public.AcademicSource.upsert({
				create: { issn, name },
				update: {},
				conflictOn: { issn },
			});

			let imported = 0;
			for (let offset = 0; offset < works.length; offset += BATCH_SIZE) {
				const batch = works.slice(offset, offset + BATCH_SIZE);
				const insert = database.raw.sql`
					WITH inserted AS (
						INSERT INTO public."externalWork"
							("sourceId", doi, title, authors, abstract, "publicationDate", journal, url)
						SELECT ${source.id}::uuid, "externalId", title, authors, abstract, "publicationDate", journal, url
						FROM ROWS FROM (
							jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS (
								"externalId" text, title text, authors text[], abstract text,
								"publicationDate" text, journal text, url text
							)
						) WITH ORDINALITY
						ORDER BY ordinality
						ON CONFLICT (doi) DO NOTHING
						RETURNING doi
					)
					SELECT count(*)::int AS count FROM inserted
				`
					.returnsRow({ count: 'pg/int4@1' })
					.build();
				// oxlint-disable-next-line no-await-in-loop -- Batches share one transaction and must preserve DOI lock order.
				const [row] = await tx.query(insert);
				imported += row.count;
			}
			return imported;
		});
	}
}
