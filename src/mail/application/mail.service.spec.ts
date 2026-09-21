import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { EmailTemplate } from '../domain/email-template.enum.js';
import { MailService } from './mail.service.js';

describe('MailService', () => {
	it('does not include recipient addresses or provider messages in failure logs', async () => {
		const logError = vi
			.spyOn(Logger.prototype, 'error')
			.mockImplementation(() => undefined);
		const service = new MailService(
			{
				getSender: vi.fn(),
				sendTemplateEmail: vi
					.fn()
					.mockRejectedValue(
						new Error('provider leaked recipient@example.com'),
					),
			} as never,
			{ t: vi.fn().mockReturnValue('Unable to send email') } as never,
			{ getOrThrow: vi.fn().mockReturnValue(true) } as never,
		);

		await expect(
			service.sendTemplateEmail({
				emailTemplate: EmailTemplate.EXAMPLE,
				to: [{ email: 'recipient@example.com' }],
				params: {},
			}),
		).rejects.toThrow('Unable to send email');

		const loggedRecord = logError.mock.calls[0]?.[0] as Record<
			string,
			unknown
		>;
		expect(loggedRecord).toMatchObject({
			event: 'email_send_failed',
			'mail.recipient_count': 1,
			'error.type': 'Error',
		});
		expect(JSON.stringify(loggedRecord)).not.toContain(
			'recipient@example.com',
		);
		expect(JSON.stringify(loggedRecord)).not.toContain('provider leaked');

		logError.mockRestore();
	});
});
