import { appendFile, chmod, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { Injectable } from '@nestjs/common';

import type {
	EmailTemplate,
	TemplateParamsMap,
} from '../domain/email-template.enum.js';
import type { MailPort } from '../domain/mail.port.js';

const CAPTURE_FILE = resolve('.local-mail/verification-emails.jsonl');

@Injectable()
export class LocalCaptureMailAdapter implements MailPort {
	getSender(): { email: string } {
		return { email: 'no-reply@localhost' };
	}

	async sendTemplateEmail<T extends EmailTemplate>({
		emailTemplate,
		subject,
		to,
		params,
	}: {
		emailTemplate: T;
		subject?: string;
		to: { email: string; name?: string }[];
		params: TemplateParamsMap[T];
	}): Promise<void> {
		await this.capture({ emailTemplate, subject, to, params });
	}

	async sendTextEmail({
		to,
		subject,
		textContent,
	}: {
		to: { email: string; name?: string }[];
		subject: string;
		textContent: string;
	}): Promise<void> {
		await this.capture({ to, subject, textContent });
	}

	async sendHtmlEmail({
		to,
		subject,
		htmlContent,
	}: {
		to: { email: string; name?: string }[];
		subject: string;
		htmlContent: string;
	}): Promise<void> {
		await this.capture({ to, subject, htmlContent });
	}

	private async capture(message: Record<string, unknown>): Promise<void> {
		await mkdir(dirname(CAPTURE_FILE), { recursive: true, mode: 0o700 });
		await appendFile(CAPTURE_FILE, `${JSON.stringify(message)}\n`, {
			mode: 0o600,
		});
		await chmod(CAPTURE_FILE, 0o600);
	}
}
