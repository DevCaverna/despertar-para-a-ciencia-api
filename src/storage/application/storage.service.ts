/// <reference types="multer" />

import { randomUUID } from 'node:crypto';

import {
	BadRequestException,
	Inject,
	Injectable,
	PayloadTooLargeException,
} from '@nestjs/common';

import { StorageFolders } from '../../enum/storage-folders.enum.js';
import type { StoragePort } from '../domain/storage.port.js';
import { STORAGE_PORT } from '../domain/storage.port.js';

export const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIMETYPES_BY_FOLDER: Record<
	StorageFolders,
	ReadonlySet<string>
> = {
	[StorageFolders.OFFERS]: new Set(['image/jpeg', 'image/png', 'image/webp']),
	[StorageFolders.COMPANIES]: new Set([
		'image/jpeg',
		'image/png',
		'image/webp',
	]),
	[StorageFolders.USERS]: new Set(['image/jpeg', 'image/png', 'image/webp']),
};

@Injectable()
export class StorageService {
	constructor(@Inject(STORAGE_PORT) private readonly storage: StoragePort) {}

	async upload({
		file,
		fileFolder,
	}: {
		file: Express.Multer.File;
		fileFolder: StorageFolders;
	}): Promise<string> {
		const fileType = await this.validateFile(file, fileFolder);
		const fileName = this.fileNameWithExtension(
			file.originalname,
			fileType.ext,
		);

		return this.storage.upload({
			path: `${fileFolder}/${randomUUID()}-${fileName}`,
			file: file.buffer,
			mimetype: fileType.mime,
			contentDisposition: 'inline',
		});
	}

	async deleteFile(path: string): Promise<void> {
		return this.storage.delete(path);
	}

	private async validateFile(
		file: Express.Multer.File,
		fileFolder: StorageFolders,
	): Promise<{ ext: string; mime: string }> {
		if (!Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
			throw new BadRequestException('An uploaded file is required.');
		}

		if (file.buffer.length > MAX_UPLOAD_SIZE_BYTES) {
			throw new PayloadTooLargeException(
				`Uploaded files must not exceed ${MAX_UPLOAD_SIZE_BYTES} bytes.`,
			);
		}

		const { fileTypeFromBuffer } = await import('file-type');
		const fileType = await fileTypeFromBuffer(file.buffer);
		if (
			!fileType ||
			!ALLOWED_MIMETYPES_BY_FOLDER[fileFolder].has(fileType.mime)
		) {
			throw new BadRequestException(
				'The uploaded file type is not allowed.',
			);
		}

		if (file.mimetype !== fileType.mime) {
			throw new BadRequestException(
				'The uploaded file content does not match its declared type.',
			);
		}

		return fileType;
	}

	private fileNameWithExtension(fileName: string, extension: string): string {
		const baseName = fileName.replace(/\.[^./\\]+$/, '');
		return `${this.sanitizeFileName(baseName) || 'file'}.${extension}`;
	}

	private sanitizeFileName(fileName: string): string {
		return fileName
			.toLowerCase()
			.replaceAll(/\s+/g, '-')
			.replaceAll(/[^a-z0-9.\-_]/g, '');
	}
}
