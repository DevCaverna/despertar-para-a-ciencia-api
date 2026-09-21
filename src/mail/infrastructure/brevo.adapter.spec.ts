import { describe, expect, it, vi } from 'vitest';

import { EmailTemplate } from '../domain/email-template.enum.js';
import { BrevoAdapter } from './brevo.adapter.js';

describe('BrevoAdapter', () => {
	const config = {
		apiKey: 'brevo-test-key',
		senderEmail: 'sender@example.com',
	};

	it('sends the expected template payload and authentication header', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response('{}', { status: 201 }));
		const adapter = new BrevoAdapter(config, fetchImpl);

		await adapter.sendTemplateEmail({
			emailTemplate: EmailTemplate.EXAMPLE,
			subject: 'Welcome',
			to: [{ email: 'recipient@example.com', name: 'Recipient' }],
			params: { code: '1234' },
			sender: { email: 'sender@example.com' },
		});

		expect(fetchImpl).toHaveBeenCalledWith(
			'https://api.brevo.com/v3/smtp/email',
			expect.objectContaining({
				method: 'POST',
				headers: expect.objectContaining({
					'api-key': 'brevo-test-key',
				}),
			}),
		);
		const [, request] = fetchImpl.mock.calls[0] ?? [];
		expect(JSON.parse(request?.body as string)).toEqual({
			templateId: EmailTemplate.EXAMPLE,
			subject: 'Welcome',
			to: [{ email: 'recipient@example.com', name: 'Recipient' }],
			params: { code: '1234' },
			sender: { email: 'sender@example.com' },
		});
	});

	it('does not expose provider response data on HTTP failures', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockImplementation(() =>
				Promise.resolve(
					new Response(
						JSON.stringify({ message: 'secret provider response' }),
						{ status: 503 },
					),
				),
			);
		const adapter = new BrevoAdapter(config, fetchImpl);

		await expect(
			adapter.sendTextEmail({
				to: [{ email: 'recipient@example.com' }],
				subject: 'Subject',
				textContent: 'Body',
				sender: { email: 'sender@example.com' },
			}),
		).rejects.toThrow('Brevo request failed with status 503');
		await expect(
			adapter.sendTextEmail({
				to: [{ email: 'recipient@example.com' }],
				subject: 'Subject',
				textContent: 'Body',
				sender: { email: 'sender@example.com' },
			}),
		).rejects.not.toThrow('secret provider response');
	});

	it('propagates network timeouts for the application service to handle', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockRejectedValue(
				new DOMException('The operation timed out', 'TimeoutError'),
			);
		const adapter = new BrevoAdapter(config, fetchImpl);

		await expect(
			adapter.sendTextEmail({
				to: [{ email: 'recipient@example.com' }],
				subject: 'Subject',
				textContent: 'Body',
				sender: { email: 'sender@example.com' },
			}),
		).rejects.toThrow('The operation timed out');
	});
});
