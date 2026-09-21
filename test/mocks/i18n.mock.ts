export function createMockI18nService(): Record<string, Mock> {
	return {
		t: vi.fn((key: string) => key),
		translate: vi.fn((key: string) => key),
	};
}
import { vi, type Mock } from 'vitest';
