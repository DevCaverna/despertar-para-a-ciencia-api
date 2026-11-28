import { describe, expect, it } from 'vitest';

import { assertPostStatusTransition, PostStatus } from './post-status.js';
import type { Post } from './post.js';

describe('post editorial status', () => {
	const allowedTransitions = new Set([
		`${PostStatus.DRAFT}->${PostStatus.PENDING_REVIEW}`,
		`${PostStatus.PENDING_REVIEW}->${PostStatus.PUBLISHED}`,
		`${PostStatus.PENDING_REVIEW}->${PostStatus.REJECTED}`,
		`${PostStatus.REJECTED}->${PostStatus.DRAFT}`,
	]);

	it.each([
		[PostStatus.DRAFT, PostStatus.PENDING_REVIEW],
		[PostStatus.PENDING_REVIEW, PostStatus.PUBLISHED],
		[PostStatus.PENDING_REVIEW, PostStatus.REJECTED],
		[PostStatus.REJECTED, PostStatus.DRAFT],
	] as const)('allows %s -> %s', (current, next) => {
		expect(() => assertPostStatusTransition(current, next)).not.toThrow();
	});

	it.each(
		Object.values(PostStatus).flatMap((current) =>
			Object.values(PostStatus)
				.filter(
					(next) => !allowedTransitions.has(`${current}->${next}`),
				)
				.map((next) => [current, next] as const),
		),
	)('rejects invalid transition %s -> %s', (current, next) => {
		expect(() => assertPostStatusTransition(current, next)).toThrow(
			`Invalid post status transition: ${current} -> ${next}`,
		);
	});

	it('accepts a status from the persisted Post type', () => {
		const current: Post['status'] = PostStatus.DRAFT;

		expect(() =>
			assertPostStatusTransition(current, PostStatus.PENDING_REVIEW),
		).not.toThrow();
	});
});
