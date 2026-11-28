#!/usr/bin/env -S node
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

import type { Contract as End } from '../../snapshots/31babe98acb7f9373ac5aeff5db77817e2f822f1c00aa95e5ac7cca433e8fb34/contract.d.ts';
import endContract from '../../snapshots/31babe98acb7f9373ac5aeff5db77817e2f822f1c00aa95e5ac7cca433e8fb34/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/cef6efd65939578a4e129348e6d26b518ae8295c8dda69165cf2936cf685e7c7/contract.d.ts';
import startContract from '../../snapshots/cef6efd65939578a4e129348e6d26b518ae8295c8dda69165cf2936cf685e7c7/contract.json' with { type: 'json' };

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations(): Migration<Start, End>['operations'] {
		return [
			this.addColumn({
				schema: 'public',
				table: 'post',
				column: col('externalWorkId', 'uuid', {
					codecRef: { codecId: 'pg/uuid@1' },
				}),
			}),
			this.addUnique({
				schema: 'public',
				table: 'post',
				constraint: 'post_externalWorkId_key',
				columns: ['externalWorkId'],
			}),
			this.addForeignKey({
				schema: 'public',
				table: 'post',
				foreignKey: {
					name: 'post_externalWorkId_fkey',
					columns: ['externalWorkId'],
					references: {
						schema: 'public',
						table: 'externalWork',
						columns: ['id'],
					},
					onDelete: 'restrict',
				},
			}),
		];
	}
}

void MigrationCLI.run(import.meta.url, M);
