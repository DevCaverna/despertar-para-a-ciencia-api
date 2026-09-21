import { Injectable } from '@nestjs/common';

import { StoragePort } from '../domain/storage.port.js';

@Injectable()
export class InMemoryStorageAdapter implements StoragePort {
	private readonly objects = new Map<string, Buffer>();

	list(params?: { prefix?: string; limit?: number }): Promise<string[]> {
		const paths = [...this.objects.keys()].filter((path) =>
			params?.prefix ? path.startsWith(params.prefix) : true,
		);

		return Promise.resolve(
			params?.limit === undefined ? paths : paths.slice(0, params.limit),
		);
	}

	upload({
		path,
		file,
	}: {
		path: string;
		file: Buffer;
		mimetype: string;
		contentDisposition: 'inline';
	}): Promise<string> {
		this.objects.set(path, file);
		return Promise.resolve(`memory://${path}`);
	}

	delete(path: string): Promise<void> {
		const key = path.startsWith('memory://')
			? path.substring('memory://'.length)
			: path;
		this.objects.delete(key);
		return Promise.resolve();
	}
}
