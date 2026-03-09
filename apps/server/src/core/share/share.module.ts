import { Module } from '@nestjs/common';
import { ShareController } from './share.controller';
import { ShareService } from './share.service';
import { TokenModule } from '../auth/token.module';
import { ShareSeoController } from './share-seo.controller';
import { ShareStaticRendererService } from './share-static-renderer.service';
import { SharePreviewMetaService } from './share-preview-meta.service';
import { ShareWechatService } from './share-wechat.service';

@Module({
  imports: [TokenModule],
  controllers: [ShareController, ShareSeoController],
  providers: [
    ShareService,
    ShareStaticRendererService,
    SharePreviewMetaService,
    ShareWechatService,
  ],
  exports: [ShareService, ShareStaticRendererService],
})
export class ShareModule {}
