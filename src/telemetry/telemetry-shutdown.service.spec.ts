import { describe, expect, it, vi } from 'vitest';

const { shutdownTelemetry } = vi.hoisted(() => ({
	shutdownTelemetry: vi.fn<() => Promise<void>>().mockResolvedValue(),
}));

vi.mock('../instrumentation.js', () => ({
	shutdownTelemetry,
}));

const { TelemetryShutdownService } =
	await import('./telemetry-shutdown.service.js');

describe('TelemetryShutdownService', () => {
	it('shuts down telemetry during application shutdown', async () => {
		const service = new TelemetryShutdownService();

		await service.onApplicationShutdown();

		expect(shutdownTelemetry).toHaveBeenCalledTimes(1);
	});
});
