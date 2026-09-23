import { vi } from 'vitest';

type MockFunction = ReturnType<typeof vi.fn>;

export interface RedisMocks {
	get: MockFunction;
	setex: MockFunction;
	del: MockFunction;
	incr: MockFunction;
	expire: MockFunction;
	ttl: MockFunction;
}

export function createMockRedis(): RedisMocks {
	return {
		get: vi.fn(),
		setex: vi.fn(),
		del: vi.fn(),
		incr: vi.fn(),
		expire: vi.fn(),
		ttl: vi.fn(),
	};
}
