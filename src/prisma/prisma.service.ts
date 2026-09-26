import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../config/config.types.js';
import {
	createPrismaDatabase,
	createPrismaPool,
	type PrismaDatabase,
	type PrismaTransaction,
} from './db.js';

interface TransactionOptions {
	transactionTimeoutMs?: number;
	statementTimeoutMs?: number;
}

@Injectable()
export class PrismaService implements OnModuleDestroy {
	private readonly pool;
	private readonly prismaClient: PrismaDatabase;
	private readonly healthPool;
	private readonly healthClient: PrismaDatabase;

	constructor(config: ConfigService<AppConfig, true>) {
		const runtimeUrl = config.getOrThrow('database.runtimeUrl', {
			infer: true,
		});
		this.pool = createPrismaPool(runtimeUrl);
		this.prismaClient = createPrismaDatabase(this.pool);
		this.healthPool = createPrismaPool(runtimeUrl, {
			connectionTimeoutMillis: 1000,
			max: 2,
		});
		this.healthClient = createPrismaDatabase(this.healthPool);
	}

	async healthCheck(): Promise<void> {
		await this.runClientTransaction(
			this.healthClient,
			async (tx) => {
				const query = this.healthClient.raw.sql`
					SELECT 1 AS value
				`
					.returnsRow({ value: 'pg/int4@1' })
					.build();
				await tx.query(query);
			},
			{ statementTimeoutMs: 2000, transactionTimeoutMs: 3000 },
		);
	}

	get database(): PrismaDatabase {
		return this.prismaClient;
	}

	private async runClientTransaction<T>(
		client: PrismaDatabase,
		fn: (tx: PrismaTransaction) => Promise<T>,
		options: TransactionOptions,
	): Promise<T> {
		return client.transaction(async (tx) => {
			if (options.statementTimeoutMs) {
				const statementTimeout = client.raw.sql`
					SELECT set_config('statement_timeout', ${String(options.statementTimeoutMs)}, TRUE) AS value
				`
					.returnsRow({ value: 'pg/text@1' })
					.build();
				await tx.query(statementTimeout);
			}
			if (options.transactionTimeoutMs) {
				const transactionTimeout = client.raw.sql`
					SELECT set_config('transaction_timeout', ${String(options.transactionTimeoutMs)}, TRUE) AS value
				`
					.returnsRow({ value: 'pg/text@1' })
					.build();
				await tx.query(transactionTimeout);
			}
			return fn(tx);
		});
	}

	async onModuleDestroy(): Promise<void> {
		await this.prismaClient.close();
		await this.pool.end();
		await this.healthClient.close();
		await this.healthPool.end();
	}
}
