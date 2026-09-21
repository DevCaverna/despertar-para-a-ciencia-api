import { Injectable } from '@nestjs/common';

import { MailPort } from '../domain/mail.port.js';

@Injectable()
export class NoopMailAdapter implements MailPort {
	getSender(): { email: string } {
		return { email: 'no-reply@example.invalid' };
	}

	async sendTemplateEmail(): Promise<void> {}

	async sendTextEmail(): Promise<void> {}

	async sendHtmlEmail(): Promise<void> {}
}
