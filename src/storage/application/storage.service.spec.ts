/// <reference types="multer" />

import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { StorageFolders } from '../../enum/storage-folders.enum.js';
import { StoragePort } from '../domain/storage.port.js';
import { StorageService } from './storage.service.js';

const PNG_FILE = Buffer.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
	0x49, 0x48, 0x44, 0x52,
]);

function createFile(
	overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File {
	return {
		buffer: PNG_FILE,
		mimetype: 'image/png',
		originalname: 'logo.exe',
		...overrides,
	} as Express.Multer.File;
}

describe('StorageService', () => {
	it('derives the extension and content type from the detected file signature', async () => {
		const upload = vi
			.fn<StoragePort['upload']>()
			.mockResolvedValue('https://assets.example/logo.png');
		const storage: StoragePort = {
			upload,
			delete: vi.fn(),
			list: vi.fn(),
		};
		const service = new StorageService(storage);

		await service.upload({
			file: createFile(),
			fileFolder: StorageFolders.COMPANIES,
		});

		expect(upload).toHaveBeenCalledWith(
			expect.objectContaining({
				contentDisposition: 'inline',
				mimetype: 'image/png',
				path: expect.stringMatching(/^companies\/[\w-]+-logo\.png$/),
			}),
		);
	});

	it('rejects content whose signature does not match the declared type', async () => {
		const service = new StorageService({
			upload: vi.fn(),
			delete: vi.fn(),
			list: vi.fn(),
		});

		await expect(
			service.upload({
				file: createFile({ mimetype: 'image/jpeg' }),
				fileFolder: StorageFolders.USERS,
			}),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it('rejects files larger than five mebibytes', async () => {
		const service = new StorageService({
			upload: vi.fn(),
			delete: vi.fn(),
			list: vi.fn(),
		});

		await expect(
			service.upload({
				file: createFile({ buffer: Buffer.alloc(5 * 1024 * 1024 + 1) }),
				fileFolder: StorageFolders.OFFERS,
			}),
		).rejects.toBeInstanceOf(PayloadTooLargeException);
	});

	it('rejects unrecognized content even when the client declares an image type', async () => {
		const service = new StorageService({
			upload: vi.fn(),
			delete: vi.fn(),
			list: vi.fn(),
		});

		await expect(
			service.upload({
				file: createFile({
					buffer: Buffer.from('<script>alert(1)</script>'),
				}),
				fileFolder: StorageFolders.OFFERS,
			}),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it('rejects empty file buffers', async () => {
		const service = new StorageService({
			upload: vi.fn(),
			delete: vi.fn(),
			list: vi.fn(),
		});

		await expect(
			service.upload({
				file: createFile({ buffer: Buffer.alloc(0) }),
				fileFolder: StorageFolders.OFFERS,
			}),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it('deletes files through the configured storage adapter', async () => {
		const deleteFile = vi.fn<StoragePort['delete']>();
		const service = new StorageService({
			upload: vi.fn(),
			delete: deleteFile,
			list: vi.fn(),
		});

		await service.deleteFile('https://assets.example/logo.png');

		expect(deleteFile).toHaveBeenCalledWith(
			'https://assets.example/logo.png',
		);
	});
});
