import type { Models } from '../../prisma/contract.d.ts';

type PersistedPostStatus = Models.public_Post['status'];

export const PostStatus = {
	DRAFT: 'DRAFT',
	PENDING_REVIEW: 'PENDING_REVIEW',
	PUBLISHED: 'PUBLISHED',
	REJECTED: 'REJECTED',
} as const satisfies Record<PersistedPostStatus, PersistedPostStatus>;

export type PostStatus = (typeof PostStatus)[keyof typeof PostStatus];

const allowedTransitions: Readonly<Record<PostStatus, readonly PostStatus[]>> =
	{
		[PostStatus.DRAFT]: [PostStatus.PENDING_REVIEW],
		[PostStatus.PENDING_REVIEW]: [
			PostStatus.PUBLISHED,
			PostStatus.REJECTED,
		],
		[PostStatus.PUBLISHED]: [],
		[PostStatus.REJECTED]: [PostStatus.DRAFT],
	};

export function assertPostStatusTransition(
	current: PostStatus,
	next: PostStatus,
): void {
	if (!allowedTransitions[current].includes(next)) {
		throw new Error(
			`Invalid post status transition: ${current} -> ${next}`,
		);
	}
}
