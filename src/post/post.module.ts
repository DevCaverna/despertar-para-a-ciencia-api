import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module.js';
import { UserModule } from '../user/user.module.js';
import { PostController } from './post.controller.js';
import { PostService } from './post.service.js';

@Module({
	imports: [PrismaModule, UserModule],
	controllers: [PostController],
	providers: [PostService],
})
export class PostModule {}
