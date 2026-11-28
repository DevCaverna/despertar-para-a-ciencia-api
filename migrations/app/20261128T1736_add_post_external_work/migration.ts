#!/usr/bin/env -S node
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

import type { Contract as End } from '../../snapshots/97d6eed3ba5703d08982da36106615eb96ca5205b06f78b3da271071ddccc7ed/contract.d.ts';
import endContract from '../../snapshots/97d6eed3ba5703d08982da36106615eb96ca5205b06f78b3da271071ddccc7ed/contract.json' with { type: 'json' };
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
			this.createIndex({
				schema: 'public',
				table: 'post',
				index: 'post_externalWorkId_idx_35efcfa1',
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
