import path from 'node:path';

import { Logger } from '@nestjs/common';
import dotenv from 'dotenv';

vi.mock('nestjs-i18n', () => import('./mocks/nestjs-i18n.mock.js'));
vi.mock('nestjs-pino', () => import('./mocks/nestjs-pino.mock.js'));
import { vi } from 'vitest';

// Carrega variáveis de ambiente do .env.test
dotenv.config({ path: path.resolve(process.cwd(), '.env.test'), quiet: true });

process.env.NODE_ENV = 'test';

Logger.overrideLogger(false);

// Timeout maior para testes de integração (30s)
vi.setConfig({ testTimeout: 30_000 });
