import { BadGatewayException, Injectable } from '@nestjs/common';

import type { BrevoConfig } from '../../config/config.types.js';
import { measureDependency } from '../../telemetry/telemetry.js';
import {
	EmailTemplate,
	TemplateParamsMap,
} from '../domain/email-template.enum.js';
import { MailPort } from '../domain/mail.port.js';

@Injectable()
export class BrevoAdapter implements MailPort {
	private readonly BREVO_API_KEY: string;
	private readonly BREVO_SENDER_EMAIL: string;
	private readonly fetchImpl: typeof fetch;

	constructor(config: BrevoConfig, fetchImpl: typeof fetch = fetch) {
		this.BREVO_API_KEY = config.apiKey;
		this.BREVO_SENDER_EMAIL = config.senderEmail;
		this.fetchImpl = fetchImpl;
	}

	private async requestToBrevo<T = unknown>(
		body: Record<string, unknown>,
	): Promise<T> {
		return measureDependency({
			dependency: 'brevo',
			operation: 'send_email',
			work: async () => {
				const response = await this.fetchImpl(
					'https://api.brevo.com/v3/smtp/email',
					{
						method: 'POST',
						headers: {
							Accept: 'application/json',
							'Content-Type': 'application/json',
							'api-key': this.BREVO_API_KEY,
						},
						body: JSON.stringify(body),
					},
				);

				if (!response.ok) {
					throw new BadGatewayException(
						`Brevo request failed with status ${response.status}`,
					);
				}

				return (await response.json()) as T;
			},
		});
	}

	private getTemplateId(emailTemplate: EmailTemplate): number {
		return emailTemplate;
	}

	getSender(): { email: string; name?: string } {
		return { email: this.BREVO_SENDER_EMAIL };
	}

	async sendTemplateEmail<T extends EmailTemplate>({
		emailTemplate,
		subject,
		to,
		params,
		sender,
	}: {
		emailTemplate: T;
		subject?: string;
		to: { email: string; name?: string }[];
		params: TemplateParamsMap[T];
		sender: {
			email: string;
			name?: string;
		};
	}): Promise<void> {
		await this.requestToBrevo({
			templateId: this.getTemplateId(emailTemplate),
			subject,
			to,
			params,
			sender,
		});
	}

	async sendTextEmail({
		to,
		subject,
		textContent,
		sender,
	}: {
		to: { email: string; name?: string }[];
		subject: string;
		textContent: string;
		sender: {
			email: string;
			name?: string;
		};
	}): Promise<void> {
		await this.requestToBrevo({
			to,
			subject,
			textContent,
			sender,
		});
	}

	async sendHtmlEmail({
		to,
		subject,
		htmlContent,
		sender,
	}: {
		to: { email: string; name?: string }[];
		subject: string;
		htmlContent: string;
		sender: {
			email: string;
			name?: string;
		};
	}): Promise<void> {
		await this.requestToBrevo({
			to,
			subject,
			htmlContent,
			sender,
		});
	}
}
