import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthService } from './application/auth.service.js';
import { AUTH_PORT } from './domain/auth.port.js';
import { FirebaseAuthAdapter } from './infrastructure/firebase-auth.adapter.js';

@Module({
	imports: [ConfigModule],
	providers: [
		{
			provide: AUTH_PORT,
			useClass: FirebaseAuthAdapter,
		},
		AuthService,
	],
	exports: [AuthService, AUTH_PORT],
})
export class AuthModule {}
