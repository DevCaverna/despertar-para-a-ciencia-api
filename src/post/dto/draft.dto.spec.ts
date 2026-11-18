import { ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { CreateDraftDto } from './create-draft.dto.js';
import { UpdateDraftDto } from './update-draft.dto.js';

const pipe = new ValidationPipe({
	whitelist: true,
	forbidNonWhitelisted: true,
	transform: true,
});

describe('draft DTOs', () => {
	it('accepts title and content for creation', async () => {
		await expect(
			pipe.transform(
				{ title: '  Título  ', content: 'Conteúdo' },
				{ type: 'body', metatype: CreateDraftDto },
			),
		).resolves.toMatchObject({ title: 'Título', content: 'Conteúdo' });
	});

	it.each(['authorId', 'status', 'publishedAt'])(
		'rejects client-controlled %s on creation',
		async (field) => {
			await expect(
				pipe.transform(
					{ title: 'Título', content: 'Conteúdo', [field]: 'forged' },
					{ type: 'body', metatype: CreateDraftDto },
				),
			).rejects.toThrow();
		},
	);

	it.each([
		{ title: '   ', content: 'Conteúdo' },
		{ title: 'Título', content: '   ' },
		{ title: 123, content: 'Conteúdo' },
	])('rejects invalid creation fields', async (body) => {
		await expect(
			pipe.transform(body, { type: 'body', metatype: CreateDraftDto }),
		).rejects.toThrow();
	});

	it('accepts a partial draft update', async () => {
		await expect(
			pipe.transform(
				{ content: 'Texto revisado' },
				{ type: 'body', metatype: UpdateDraftDto },
			),
		).resolves.toMatchObject({ content: 'Texto revisado' });
	});

	it.each([
		{ status: 'PUBLISHED' },
		{ authorId: 'forged-author' },
		{ title: null },
		{ content: '   ' },
	])('rejects invalid update fields', async (body) => {
		await expect(
			pipe.transform(body, { type: 'body', metatype: UpdateDraftDto }),
		).rejects.toThrow();
	});
});
