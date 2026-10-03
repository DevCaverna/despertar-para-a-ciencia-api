import { describe, expect, it } from 'vitest';

import { assertPostStatusTransition, PostStatus } from './post-status.js';

describe('post editorial status', () => {
	const allowedTransitions: Array<[PostStatus, PostStatus]> = [
		[PostStatus.DRAFT, PostStatus.PENDING_REVIEW],
		[PostStatus.PENDING_REVIEW, PostStatus.PUBLISHED],
		[PostStatus.PENDING_REVIEW, PostStatus.REJECTED],
		[PostStatus.REJECTED, PostStatus.DRAFT],
	];

	it.each(
		Object.values(PostStatus).flatMap((current) =>
			Object.values(PostStatus).map((next) => [current, next] as const),
		),
	)('validates %s -> %s', (current, next) => {
		const transition = (): void =>
			assertPostStatusTransition(current, next);
		if (
			allowedTransitions.some(
				([from, to]) => from === current && to === next,
			)
		) {
			expect(transition).not.toThrow();
		} else {
			expect(transition).toThrow('Invalid post status transition');
		}
	});
});
