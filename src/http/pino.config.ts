import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import type { Options } from 'pino-http';

const requestIdPattern = /^[A-Za-z0-9._~-]{1,64}$/;

export type PinoRequest = IncomingMessage & {
	route?: { path?: string };
};

export function requestId(req: IncomingMessage): string {
	const value = req.headers['x-request-id'];
	const candidate = Array.isArray(value) ? value[0] : value;
	if (candidate && requestIdPattern.test(candidate)) return candidate;
	if (typeof req.id === 'string' && requestIdPattern.test(req.id)) {
		return req.id;
	}
	return randomUUID();
}

function accessLogFields(
	req: PinoRequest,
	res: ServerResponse,
	responseTime: number,
): Record<string, string | number | undefined> {
	return {
		'request.id': typeof req.id === 'object' ? undefined : req.id,
		'http.request.method': req.method,
		'http.route': req.route?.path ?? '[unknown]',
		'http.response.status_code': res.statusCode,
		duration_ms: responseTime,
	};
}

function customSuccessObject(
	req: PinoRequest,
	res: ServerResponse,
	val: { responseTime: number },
): Record<string, string | number | undefined> {
	return accessLogFields(req, res, val.responseTime);
}

function customErrorObject(
	req: PinoRequest,
	res: ServerResponse,
	error: Error,
	val: { responseTime: number },
): Record<string, string | number | undefined> {
	return {
		...accessLogFields(req, res, val.responseTime),
		'error.type': error.constructor.name,
	};
}

export function createPinoHttpOptions(level: string, pretty: boolean): Options {
	return {
		genReqId: requestId,
		autoLogging: true,
		customLogLevel: (req, res) => {
			if (
				req.url?.split('?')[0] === '/health/live' ||
				(req.url?.split('?')[0] === '/health/ready' &&
					res.statusCode < 400)
			) {
				return 'silent';
			}
			return res.statusCode >= 500
				? 'error'
				: res.statusCode >= 400
					? 'warn'
					: 'info';
		},
		customSuccessObject,
		customErrorObject,
		redact: {
			paths: [
				'req.headers.authorization',
				'req.headers.cookie',
				'req.headers["set-cookie"]',
				'res.headers["set-cookie"]',
				'password',
				'token',
				'access_token',
				'refresh_token',
				'privateKey',
				'apiKey',
				'clientSecret',
				'secretAccessKey',
			],
			censor: '[Redacted]',
		},
		quietReqLogger: true,
		quietResLogger: true,
		level,
		transport: pretty ? { target: 'pino-pretty' } : undefined,
	};
}
