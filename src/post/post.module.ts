import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module.js';
import { UserModule } from '../user/user.module.js';
import { PostController } from './post.controller.js';
import { PostService } from './post.service.js';
import { PublicPostController } from './public-post.controller.js';

@Module({
	imports: [PrismaModule, UserModule],
	controllers: [PostController, PublicPostController],
	providers: [PostService],
})
export class PostModule {}
