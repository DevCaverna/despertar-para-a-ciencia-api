import { describe, expect, it } from 'vitest';

import { assertExistingAccountsActive } from './create-admin.js';

describe('create-admin account state validation', () => {
	it('allows active Firebase accounts and PostgreSQL profiles', () => {
		expect(() =>
			assertExistingAccountsActive({
				firebaseDisabled: false,
				profileActive: true,
			}),
		).not.toThrow();
	});

	it('rejects disabled Firebase accounts without reactivating them', () => {
		expect(() =>
			assertExistingAccountsActive({
				firebaseDisabled: true,
				profileActive: true,
			}),
		).toThrow('Conta Firebase desativada');
	});

	it('rejects inactive PostgreSQL profiles', () => {
		expect(() =>
			assertExistingAccountsActive({
				firebaseDisabled: false,
				profileActive: false,
			}),
		).toThrow('Perfil PostgreSQL inativo');
	});
});
