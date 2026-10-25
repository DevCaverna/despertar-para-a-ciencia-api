import type { Models } from '../../prisma/contract.d.ts';

export type Post = Omit<Models.public_Post, 'author'>;
