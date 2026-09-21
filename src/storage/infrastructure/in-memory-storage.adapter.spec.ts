import { describe, expect, it } from 'vitest';

import { InMemoryStorageAdapter } from './in-memory-storage.adapter.js';

describe('InMemoryStorageAdapter', () => {
	it('stores, lists and deletes uploaded files', async () => {
		const storage = new InMemoryStorageAdapter();
		const url = await storage.upload({
			path: 'uploads/file.txt',
			file: Buffer.from('content'),
			mimetype: 'text/plain',
			contentDisposition: 'inline',
		});

		expect(url).toBe('memory://uploads/file.txt');
		expect(await storage.list({ prefix: 'uploads/' })).toEqual([
			'uploads/file.txt',
		]);

		await storage.delete(url);

		expect(await storage.list()).toEqual([]);
	});
});
