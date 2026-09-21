export function createMockMailService(): Record<string, Mock> {
	return {
		sendTextEmail: vi.fn(),
		sendTemplateEmail: vi.fn(),
		sendHtmlEmail: vi.fn(),
	};
}
import { vi, type Mock } from 'vitest';
