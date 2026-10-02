#!/usr/bin/env -S node
import {
	Migration,
	MigrationCLI,
	checkExpression,
	col,
	fn,
	lit,
	primaryKey,
} from '@prisma/orm-postgres/migration';

import type { Contract as Start } from '../../snapshots/3df1550d33ef79561aa7692fd8f65c8a53d5dcdca36ce7598cd9aa13e1deaebe/contract.d.ts';
import startContract from '../../snapshots/3df1550d33ef79561aa7692fd8f65c8a53d5dcdca36ce7598cd9aa13e1deaebe/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/69feaa37cbf29d389f720c4863ce4fc4814be17452f3dc941a8d3aed4e4d9596/contract.d.ts';
import endContract from '../../snapshots/69feaa37cbf29d389f720c4863ce4fc4814be17452f3dc941a8d3aed4e4d9596/contract.json' with { type: 'json' };

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations(): Migration<Start, End>['operations'] {
		return [
			this.createTable({
				schema: 'public',
				table: 'post',
				columns: [
					col('authorId', 'uuid', {
						notNull: true,
						codecRef: { codecId: 'pg/uuid@1' },
					}),
					col('content', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
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
					col('publishedAt', 'timestamptz', {
						codecRef: { codecId: 'pg/timestamptz-string@1' },
					}),
					col('rejectionReason', 'text', {
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('status', 'text', {
						notNull: true,
						default: lit('DRAFT'),
						codecRef: { codecId: 'pg/text@1' },
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
				],
				constraints: [
					primaryKey(['id']),
					checkExpression(
						'post_status_check_370e3d25',
						"\"status\" IN ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED')",
					),
				],
			}),
			this.createIndex({
				schema: 'public',
				table: 'post',
				index: 'post_authorId_idx_e47547ed',
				columns: ['authorId'],
			}),
			this.addForeignKey({
				schema: 'public',
				table: 'post',
				foreignKey: {
					name: 'post_authorId_fkey',
					columns: ['authorId'],
					references: {
						schema: 'public',
						table: 'user',
						columns: ['id'],
					},
					onDelete: 'restrict',
				},
			}),
		];
	}
}

void MigrationCLI.run(import.meta.url, M);
