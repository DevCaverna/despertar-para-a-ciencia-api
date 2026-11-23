import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserRole } from '../../auth/domain/user-role.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AcademicWorkRepository } from '../infrastructure/academic-work.repository.js';
import {
	AcademicWorkSourceError,
	type AcademicWorkSourcePort,
} from './academic-work-source.port.js';
import { AcademicWorkService } from './academic-work.service.js';

const actor = {
	subject: 'firebase-user',
	id: '019a6776-f403-7c59-b203-cff389227a5e',
	email: 'admin@example.com',
	emailVerified: true,
	roles: [UserRole.ADMIN],
};
const request = { issn: '1234-567X', name: 'Science Journal' };
const firstWork = {
	externalId: '10.1234/first',
	title: 'First article',
	authors: ['Ada Lovelace'],
};
const secondWork = {
	externalId: '10.1234/second',
	title: 'Second article',
	authors: ['Grace Hopper'],
};

describe('AcademicWorkService', () => {
	let service: AcademicWorkService;
	let search: ReturnType<typeof vi.fn>;
	let userFirst: ReturnType<typeof vi.fn>;
	let importWorks: ReturnType<typeof vi.fn>;
	let list: ReturnType<typeof vi.fn>;
	let get: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		search = vi.fn().mockResolvedValue({ items: [] });
		userFirst = vi.fn().mockResolvedValue({ id: actor.id, active: true });
		importWorks = vi.fn().mockResolvedValue(0);
		list = vi.fn().mockResolvedValue({
			items: [],
			page: 1,
			perPage: 20,
			hasNextPage: false,
		});
		get = vi.fn().mockResolvedValue(null);
		const prisma = {
			database: {
				orm: {
					public: {
						User: { where: vi.fn(() => ({ first: userFirst })) },
					},
				},
			},
		} as unknown as PrismaService;
		const messages: Record<string, string> = {
			'errors.ACADEMIC_SOURCE_UNAVAILABLE': 'Academic source unavailable',
			'errors.ACADEMIC_SOURCE_PAGINATION_INVALID':
				'Invalid source pagination',
			'errors.ACADEMIC_WORK_DATE_RANGE_INVALID':
				'The start date must not be after the end date.',
		};
		service = new AcademicWorkService(
			prisma,
			{
				search,
			} as AcademicWorkSourcePort,
			{
				t: (key: string) => messages[key] ?? key,
			} as never,
			{ importWorks, list, get } as unknown as AcademicWorkRepository,
		);
	});

	it('consults only persisted works after verifying the active profile', async () => {
		await expect(
			service.list(actor, { page: 1, perPage: 20 }),
		).resolves.toEqual({
			items: [],
			page: 1,
			perPage: 20,
			hasNextPage: false,
		});
		expect(list).toHaveBeenCalledWith(1, 20);
		expect(search).not.toHaveBeenCalled();
	});

	it('rejects an unsafe consultation offset and an inactive profile', async () => {
		await expect(
			service.list(actor, { page: Number.MAX_SAFE_INTEGER, perPage: 20 }),
		).rejects.toThrow('Pagination offset must be a safe integer.');
		expect(list).not.toHaveBeenCalled();
		userFirst.mockResolvedValue(undefined);
		await expect(
			service.list(actor, { page: 1, perPage: 20 }),
		).rejects.toThrow();
		expect(list).not.toHaveBeenCalled();
	});

	it('returns the selected work and rejects a missing id', async () => {
		const work = { id: actor.id, title: 'Research' };
		get.mockResolvedValueOnce(work);
		await expect(service.get(actor, actor.id)).resolves.toEqual(work);
		await expect(service.get(actor, actor.id)).rejects.toThrow();
		expect(get).toHaveBeenCalledWith(actor.id);
	});

	it('imports works and ignores known DOIs on retry', async () => {
		search.mockResolvedValue({ items: [firstWork, secondWork] });
		importWorks.mockResolvedValueOnce(2);

		await expect(service.sync(actor, request)).resolves.toEqual({
			found: 2,
			imported: 2,
			ignored: 0,
		});
		await expect(service.sync(actor, request)).resolves.toEqual({
			found: 2,
			imported: 0,
			ignored: 2,
		});
		expect(importWorks).toHaveBeenCalledWith('1234567X', request.name, [
			firstWork,
			secondWork,
		]);
	});

	it('follows source cursors and returns a continuation cursor at the page cap', async () => {
		for (let pageNumber = 1; pageNumber <= 10; pageNumber++) {
			search.mockResolvedValueOnce({
				items: [],
				nextCursor: `page-${pageNumber}`,
			});
		}

		await expect(service.sync(actor, request)).resolves.toEqual({
			found: 0,
			imported: 0,
			ignored: 0,
			nextCursor: 'page-10',
		});
		expect(search).toHaveBeenCalledTimes(10);
		expect(search).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ cursor: 'page-1' }),
		);
	});

	it('rejects a repeated pagination cursor before persisting', async () => {
		search.mockResolvedValue({ items: [firstWork], nextCursor: 'same' });

		await expect(
			service.sync(actor, { ...request, cursor: 'same' }),
		).rejects.toThrow('Invalid source pagination');
		expect(importWorks).not.toHaveBeenCalled();
	});

	it('rejects an inactive profile', async () => {
		userFirst.mockResolvedValue(undefined);

		await expect(service.sync(actor, request)).rejects.toThrow();
		expect(search).not.toHaveBeenCalled();
	});

	it('rejects a reversed publication date range', async () => {
		await expect(
			service.sync(actor, {
				...request,
				fromDate: '2026-12-01',
				untilDate: '2026-01-01',
			}),
		).rejects.toThrow('The start date must not be after the end date.');
		expect(search).not.toHaveBeenCalled();
	});

	it('does not persist when the source fails', async () => {
		search
			.mockResolvedValueOnce({ items: [firstWork], nextCursor: 'page-2' })
			.mockRejectedValueOnce(new AcademicWorkSourceError('unavailable'));

		await expect(service.sync(actor, request)).rejects.toThrow(
			'Academic source unavailable',
		);
		expect(importWorks).not.toHaveBeenCalled();
	});
});
