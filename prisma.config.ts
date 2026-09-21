// oxlint-disable-next-line import/no-unassigned-import
import 'dotenv/config';
import { defineConfig } from '@prisma/orm-postgres/config';
import { definePrismaConfig } from 'prisma/config';

export default definePrismaConfig({
	orm: defineConfig({
		contract: './src/prisma/contract.prisma',
		db: {
			connection: process.env['DATABASE_URL'],
		},
		migrations: { dir: './migrations' },
	}),
}) as ReturnType<typeof definePrismaConfig>;
