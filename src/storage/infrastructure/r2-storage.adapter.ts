import {
	DeleteObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import type { R2Config } from '../../config/config.types.js';
import { measureDependency } from '../../telemetry/telemetry.js';
import { StoragePort } from '../domain/storage.port.js';

@Injectable()
export class R2StorageAdapter implements StoragePort {
	private readonly client: S3Client;
	private readonly bucketName: string;
	private readonly publicUrl: string;

	constructor(config: R2Config, client?: S3Client) {
		this.bucketName = config.bucketName;
		this.publicUrl = config.publicUrl;
		this.client =
			client ??
			new S3Client({
				region: 'auto',
				endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
				credentials: {
					accessKeyId: config.accessKeyId,
					secretAccessKey: config.secretAccessKey,
				},
			});
	}

	async list(params?: {
		prefix?: string;
		limit?: number;
	}): Promise<string[]> {
		const result = await this.execute(
			() =>
				this.client.send(
					new ListObjectsV2Command({
						Bucket: this.bucketName,
						Prefix: params?.prefix,
						MaxKeys: params?.limit,
					}),
				),
			'list',
		);
		return (result.Contents ?? [])
			.map((object) => object.Key)
			.filter((key): key is string => key !== undefined);
	}

	async upload({
		path,
		file,
		mimetype,
		contentDisposition,
	}: {
		path: string;
		file: Buffer;
		mimetype: string;
		contentDisposition: 'inline';
	}): Promise<string> {
		await this.execute(
			() =>
				this.client.send(
					new PutObjectCommand({
						Bucket: this.bucketName,
						Key: path,
						Body: file,
						ContentType: mimetype,
						ContentDisposition: contentDisposition,
					}),
				),
			'upload',
		);
		return `${this.publicUrl}/${path}`;
	}

	private extractKeyFromUrl(url: string): string {
		try {
			const pathname = new URL(url).pathname;
			return pathname.startsWith('/') ? pathname.substring(1) : pathname;
		} catch {
			return url;
		}
	}

	private async execute<T>(
		request: () => Promise<T>,
		operation: 'list' | 'upload' | 'delete',
	): Promise<T> {
		try {
			return await measureDependency({
				dependency: 'r2',
				operation,
				work: request,
			});
		} catch {
			throw new ServiceUnavailableException('R2 storage request failed.');
		}
	}

	async delete(path: string): Promise<void> {
		await this.execute(
			() =>
				this.client.send(
					new DeleteObjectCommand({
						Bucket: this.bucketName,
						Key: this.extractKeyFromUrl(path),
					}),
				),
			'delete',
		);
	}
}
