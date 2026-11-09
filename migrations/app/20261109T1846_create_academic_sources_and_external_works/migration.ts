#!/usr/bin/env -S node
import {
	Migration,
	MigrationCLI,
	checkExpression,
	col,
	fn,
	primaryKey,
} from '@prisma/orm-postgres/migration';

import type { Contract as Start } from '../../snapshots/69feaa37cbf29d389f720c4863ce4fc4814be17452f3dc941a8d3aed4e4d9596/contract.d.ts';
import startContract from '../../snapshots/69feaa37cbf29d389f720c4863ce4fc4814be17452f3dc941a8d3aed4e4d9596/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/cef6efd65939578a4e129348e6d26b518ae8295c8dda69165cf2936cf685e7c7/contract.d.ts';
import endContract from '../../snapshots/cef6efd65939578a4e129348e6d26b518ae8295c8dda69165cf2936cf685e7c7/contract.json' with { type: 'json' };

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations(): Migration<Start, End>['operations'] {
		return [
			this.createTable({
				schema: 'public',
				table: 'academicSource',
				columns: [
					col('createdAt', 'timestamptz', {
						notNull: true,
						default: fn('now()'),
						codecRef: { codecId: 'pg/timestamptz-string@1' },
					}),
					col('id', 'uuid', {
						notNull: true,
						default: fn('uuidv7()'),
						codecRef: { codecId: 'pg/uuid@1' },
					}),
					col('issn', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('name', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('updatedAt', 'timestamptz', {
						notNull: true,
						default: fn('now()'),
						codecRef: { codecId: 'pg/timestamptz-string@1' },
					}),
				],
				constraints: [primaryKey(['id'])],
			}),
			this.createTable({
				schema: 'public',
				table: 'externalWork',
				columns: [
					col('abstract', 'text', {
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('authors', 'text[]', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1', many: true },
					}),
					col('createdAt', 'timestamptz', {
						notNull: true,
						default: fn('now()'),
						codecRef: { codecId: 'pg/timestamptz-string@1' },
					}),
					col('doi', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('id', 'uuid', {
						notNull: true,
						default: fn('uuidv7()'),
						codecRef: { codecId: 'pg/uuid@1' },
					}),
					col('journal', 'text', {
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('publicationDate', 'text', {
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('sourceId', 'uuid', {
						notNull: true,
						codecRef: { codecId: 'pg/uuid@1' },
					}),
					col('title', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('updatedAt', 'timestamptz', {
						notNull: true,
						default: fn('now()'),
						codecRef: { codecId: 'pg/timestamptz-string@1' },
					}),
					col('url', 'text', { codecRef: { codecId: 'pg/text@1' } }),
				],
				constraints: [
					primaryKey(['id']),
					checkExpression(
						'externalWork_authors_elem_not_null_2033f92a',
						'array_position("authors", NULL) IS NULL',
					),
				],
			}),
			this.addUnique({
				schema: 'public',
				table: 'academicSource',
				constraint: 'academicSource_issn_key',
				columns: ['issn'],
			}),
			this.addUnique({
				schema: 'public',
				table: 'externalWork',
				constraint: 'externalWork_doi_key',
				columns: ['doi'],
			}),
			this.createIndex({
				schema: 'public',
				table: 'externalWork',
				index: 'externalWork_sourceId_idx_d92a2571',
				columns: ['sourceId'],
			}),
			this.addForeignKey({
				schema: 'public',
				table: 'externalWork',
				foreignKey: {
					name: 'externalWork_sourceId_fkey',
					columns: ['sourceId'],
					references: {
						schema: 'public',
						table: 'academicSource',
						columns: ['id'],
					},
					onDelete: 'restrict',
				},
			}),
		];
	}
}

void MigrationCLI.run(import.meta.url, M);
