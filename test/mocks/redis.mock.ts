import { vi } from 'vitest';

type MockFunction = ReturnType<typeof vi.fn>;

export interface RedisMocks {
	get: MockFunction;
	setex: MockFunction;
	del: MockFunction;
	incr: MockFunction;
	expire: MockFunction;
	ttl: MockFunction;
	eval: MockFunction;
	multi: MockFunction;
	transaction: { setex: MockFunction; exec: MockFunction };
}

export function createMockRedis(): RedisMocks {
	const transaction = {
		setex: vi.fn().mockReturnThis(),
		exec: vi.fn().mockResolvedValue([]),
	};
	return {
		get: vi.fn(),
		setex: vi.fn(),
		del: vi.fn(),
		incr: vi.fn(),
		expire: vi.fn(),
		ttl: vi.fn(),
		eval: vi.fn().mockResolvedValue(1),
		multi: vi.fn(() => transaction),
		transaction,
	};
}
