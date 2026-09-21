import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		coverage: {
			provider: 'v8',
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.spec.ts', 'src/generated/**', 'src/main.ts'],
			thresholds: {
				branches: 45,
				functions: 55,
				lines: 55,
				statements: 55,
			},
		},
		projects: [
			{
				test: {
					name: 'unit',
					include: ['src/**/*.spec.ts'],
					setupFiles: ['./test/setup-unit.ts'],
					environment: 'node',
				},
			},
			{
				test: {
					name: 'e2e',
					include: ['./test/**/*.e2e-spec.ts'],
					setupFiles: ['./test/setup-int.ts'],
					globalSetup: ['./test/global-setup-int.ts'],
					environment: 'node',
				},
			},
			{
				test: {
					name: 'firebase-auth',
					include: ['./test/firebase-auth.emulator.spec.ts'],
					setupFiles: ['./test/setup-int.ts'],
					environment: 'node',
				},
			},
		],
	},
});
