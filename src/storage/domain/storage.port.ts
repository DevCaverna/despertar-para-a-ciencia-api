export const STORAGE_PORT = Symbol('StoragePort');

export interface StoragePort {
	upload(params: {
		path: string;
		file: Buffer;
		mimetype: string;
		contentDisposition: 'inline';
	}): Promise<string>;
	delete(path: string): Promise<void>;
	list(params?: { prefix?: string; limit?: number }): Promise<string[]>;
}
