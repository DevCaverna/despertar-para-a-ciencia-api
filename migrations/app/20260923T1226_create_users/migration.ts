#!/usr/bin/env -S node
import {
	Migration,
	MigrationCLI,
	col,
	fn,
	lit,
	primaryKey,
} from '@prisma/orm-postgres/migration';

import type { Contract as Start } from '../../snapshots/0c0734babd6eeb868fee1f281ca96963022475611560e9f170f465daa35f8599/contract.d.ts';
import startContract from '../../snapshots/0c0734babd6eeb868fee1f281ca96963022475611560e9f170f465daa35f8599/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/3df1550d33ef79561aa7692fd8f65c8a53d5dcdca36ce7598cd9aa13e1deaebe/contract.d.ts';
import endContract from '../../snapshots/3df1550d33ef79561aa7692fd8f65c8a53d5dcdca36ce7598cd9aa13e1deaebe/contract.json' with { type: 'json' };

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations(): Migration<Start, End>['operations'] {
		return [
			this.createTable({
				schema: 'public',
				table: 'user',
				columns: [
					col('active', 'bool', {
						notNull: true,
						default: lit(true),
						codecRef: { codecId: 'pg/bool@1' },
					}),
					col('createdAt', 'timestamptz', {
						notNull: true,
						default: fn('now()'),
						codecRef: { codecId: 'pg/timestamptz-string@1' },
					}),
					col('email', 'text', {
						notNull: true,
						codecRef: { codecId: 'pg/text@1' },
					}),
					col('id', 'uuid', {
						notNull: true,
						default: fn('uuidv7()'),
						codecRef: { codecId: 'pg/uuid@1' },
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
			this.addUnique({
				schema: 'public',
				table: 'user',
				constraint: 'user_email_key',
				columns: ['email'],
			}),
		];
	}
}

void MigrationCLI.run(import.meta.url, M);
