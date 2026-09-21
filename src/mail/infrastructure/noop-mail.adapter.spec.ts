import { describe, expect, it } from 'vitest';

import { EmailTemplate } from '../domain/email-template.enum.js';
import { MailPort } from '../domain/mail.port.js';
import { NoopMailAdapter } from './noop-mail.adapter.js';

describe('NoopMailAdapter', () => {
	it('accepts every mail operation without retaining or emitting mail content', async () => {
		const adapter: MailPort = new NoopMailAdapter();
		const sender = adapter.getSender();

		expect(sender).toEqual({ email: 'no-reply@example.invalid' });

		await expect(
			Promise.all([
				adapter.sendTemplateEmail({
					emailTemplate: EmailTemplate.EXAMPLE,
					to: [{ email: 'recipient@example.com' }],
					params: { token: 'secret' },
					sender,
				}),
				adapter.sendTextEmail({
					to: [{ email: 'recipient@example.com' }],
					subject: 'Subject',
					textContent: 'Sensitive text',
					sender,
				}),
				adapter.sendHtmlEmail({
					to: [{ email: 'recipient@example.com' }],
					subject: 'Subject',
					htmlContent: '<p>Sensitive HTML</p>',
					sender,
				}),
			]),
		).resolves.toEqual([undefined, undefined, undefined]);
	});
});
