import { vi } from 'vitest';

type MockFunction = ReturnType<typeof vi.fn>;

export interface PrismaMocks {
	prisma: {
		database: {
			orm: {
				public: Record<string, unknown>;
			};
		};
	};
	users: Record<string, MockFunction>;
}

export function createMockPrisma(): PrismaMocks {
	const users = {
		findById: vi.fn(),
		findByEmail: vi.fn(),
		create: vi.fn(),
		update: vi.fn(),
		list: vi.fn(),
		findAllActive: vi.fn(),
	};
	const prisma = {
		database: {
			orm: {
				public: {
					User: {
						first: users.findById,
						create: users.create,
						where: (_filter: Record<string, unknown>) => ({
							first: users.findByEmail,
							update: users.update,
							all: users.findAllActive,
						}),
						orderBy: () => ({
							offset: () => ({
								limit: () => ({
									all: users.list,
								}),
							}),
						}),
					},
				},
			},
		},
	};

	return { prisma, users };
}
