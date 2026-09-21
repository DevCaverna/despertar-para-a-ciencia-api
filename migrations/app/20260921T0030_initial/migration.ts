#!/usr/bin/env -S node
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

import type { Contract as End } from '../../snapshots/0c0734babd6eeb868fee1f281ca96963022475611560e9f170f465daa35f8599/contract.d.ts';
import endContract from '../../snapshots/0c0734babd6eeb868fee1f281ca96963022475611560e9f170f465daa35f8599/contract.json' with { type: 'json' };

export default class M extends Migration<never, End> {
	override readonly endContractJson = endContract;

	override get operations(): Migration<never, End>['operations'] {
		return [this.createSchema({ schema: 'public' })];
	}
}

void MigrationCLI.run(import.meta.url, M);
