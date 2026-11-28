import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

import { PostStatus } from '../domain/post-status.js';

const decisionStatuses = [PostStatus.PUBLISHED, PostStatus.REJECTED] as const;

export class ReviewDecisionDto {
	@ApiProperty({ enum: [...decisionStatuses] })
	@IsIn(decisionStatuses)
	status!: (typeof decisionStatuses)[number];
}
