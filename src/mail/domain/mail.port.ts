import {
	EmailTemplate,
	type TemplateParamsMap,
} from './email-template.enum.js';

export const MAIL_PORT = Symbol('MailPort');

export interface MailPort {
	getSender(): { email: string; name?: string };

	sendTemplateEmail<T extends EmailTemplate>({
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
		sender: { email: string; name?: string };
	}): Promise<void>;

	sendTextEmail({
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
	}): Promise<void>;

	sendHtmlEmail({
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
	}): Promise<void>;
}
