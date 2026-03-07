import { Module } from '@nestjs/common';
import { ShareController } from './share.controller';
import { ShareService } from './share.service';
import { TokenModule } from '../auth/token.module';
import { ShareSeoController } from './share-seo.controller';
import { ShareStaticRendererService } from './share-static-renderer.service';

@Module({
  imports: [TokenModule],
  controllers: [ShareController, ShareSeoController],
  providers: [ShareService, ShareStaticRendererService],
  exports: [ShareService],
})
export class ShareModule {}
