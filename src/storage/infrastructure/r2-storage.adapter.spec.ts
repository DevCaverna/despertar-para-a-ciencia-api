import {
	DeleteObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	S3Client,
} from '@aws-sdk/client-s3';
import { describe, expect, it, vi, type Mock } from 'vitest';

import { R2StorageAdapter } from './r2-storage.adapter.js';

describe('R2StorageAdapter', () => {
	const config = {
		accountId: 'account',
		accessKeyId: 'access-key',
		secretAccessKey: 'secret-key',
		bucketName: 'uploads',
		publicUrl: 'https://assets.example.com',
	};

	function createClient(): S3Client & { send: Mock } {
		return {
			send: vi.fn(),
		} as unknown as S3Client & { send: Mock };
	}

	it('uploads with the configured bucket, key, content type and disposition', async () => {
		const client = createClient();
		client.send.mockResolvedValue({});
		const adapter = new R2StorageAdapter(config, client);

		await expect(
			adapter.upload({
				path: 'uploads/image.png',
				file: Buffer.from('png'),
				mimetype: 'image/png',
				contentDisposition: 'inline',
			}),
		).resolves.toBe('https://assets.example.com/uploads/image.png');

		const command = client.send.mock.calls[0]?.[0];
		expect(command).toBeInstanceOf(PutObjectCommand);
		expect(command.input).toMatchObject({
			Bucket: 'uploads',
			Key: 'uploads/image.png',
			ContentType: 'image/png',
			ContentDisposition: 'inline',
		});
	});

	it('lists keys and deletes either a public URL or a raw key', async () => {
		const client = createClient();
		client.send
			.mockResolvedValueOnce({
				Contents: [{ Key: 'a.png' }, {}, { Key: 'b.png' }],
			})
			.mockResolvedValueOnce({})
			.mockResolvedValueOnce({});
		const adapter = new R2StorageAdapter(config, client);

		expect(await adapter.list({ prefix: 'uploads/', limit: 10 })).toEqual([
			'a.png',
			'b.png',
		]);
		await adapter.delete('https://assets.example.com/uploads/a.png');
		await adapter.delete('uploads/b.png');

		expect(client.send.mock.calls[0]?.[0]).toBeInstanceOf(
			ListObjectsV2Command,
		);
		expect(client.send.mock.calls[1]?.[0]).toBeInstanceOf(
			DeleteObjectCommand,
		);
		expect(client.send.mock.calls[1]?.[0].input.Key).toBe('uploads/a.png');
		expect(client.send.mock.calls[2]?.[0].input.Key).toBe('uploads/b.png');
	});

	it('redacts provider failures', async () => {
		const client = createClient();
		client.send.mockRejectedValue(
			new Error('provider unavailable access-key secret-key'),
		);
		const adapter = new R2StorageAdapter(config, client);

		await expect(adapter.list()).rejects.toThrow(
			'R2 storage request failed.',
		);
		await expect(adapter.list()).rejects.not.toThrow('access-key');
		await expect(adapter.list()).rejects.not.toThrow('secret-key');
	});
});
