import {
  Global,
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { WorkspaceModule } from './workspace/workspace.module';
import { PageModule } from './page/page.module';
import { AttachmentModule } from './attachment/attachment.module';
import { CommentModule } from './comment/comment.module';
import { SearchModule } from './search/search.module';
import { SpaceModule } from './space/space.module';
import { GroupModule } from './group/group.module';
import { CaslModule } from './casl/casl.module';
import { PageAccessModule } from './page/page-access/page-access.module';
import { DomainMiddleware } from '../common/middlewares/domain.middleware';
import { AuditContextMiddleware } from '../common/middlewares/audit-context.middleware';
import { WorkspaceChannelMiddleware } from '../common/middlewares/workspace-channel.middleware';
import { ShareModule } from './share/share.module';
import { NotificationModule } from './notification/notification.module';
import { WatcherModule } from './watcher/watcher.module';
import { FavoriteModule } from './favorite/favorite.module';
import { SessionModule } from './session/session.module';
import { AUDIT_SERVICE } from '../integrations/audit/audit.service';
import { IntegrationTokenModule } from './integration-token/integration-token.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { AuditLogService } from './audit-log/services/audit-log.service';
import { McpModule } from './mcp/mcp.module';
import { EditorSessionModule } from './editor-session/editor-session.module';

@Global()
@Module({
  imports: [
    UserModule,
    AuthModule,
    WorkspaceModule,
    PageModule,
    AttachmentModule,
    CommentModule,
    FavoriteModule,
    SearchModule,
    SpaceModule,
    GroupModule,
    CaslModule,
    PageAccessModule,
    ShareModule,
    NotificationModule,
    WatcherModule,
    SessionModule,
    IntegrationTokenModule,
    AuditLogModule,
    McpModule,
    EditorSessionModule,
  ],
  providers: [
    {
      provide: AUDIT_SERVICE,
      useExisting: AuditLogService,
    },
  ],
  exports: [AUDIT_SERVICE],
})
export class CoreModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    const excludedRoutes = [
      { path: 'auth/setup', method: RequestMethod.POST },
      { path: 'health', method: RequestMethod.GET },
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'billing/stripe/webhook', method: RequestMethod.POST },
    ];

    consumer
      .apply(
        DomainMiddleware,
        WorkspaceChannelMiddleware,
        AuditContextMiddleware,
      )
      .exclude(...excludedRoutes)
      .forRoutes('*');
  }
}
