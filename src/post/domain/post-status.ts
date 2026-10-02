export enum PostStatus {
	DRAFT = 'DRAFT',
	PENDING_REVIEW = 'PENDING_REVIEW',
	PUBLISHED = 'PUBLISHED',
	REJECTED = 'REJECTED',
}

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
