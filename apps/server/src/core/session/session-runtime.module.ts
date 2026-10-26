import { Global, Module } from '@nestjs/common';
import { TokenModule } from '../auth/token.module';
import { SessionService } from './session.service';
import { SessionActivityService } from './session-activity.service';
import { SessionConnectionsService } from './session-connections.service';

/** Shared by HTTP and standalone collaboration without exposing HTTP endpoints. */
@Global()
@Module({
  imports: [TokenModule],
  providers: [
    SessionService,
    SessionActivityService,
    SessionConnectionsService,
  ],
  exports: [SessionService, SessionActivityService, SessionConnectionsService],
})
export class SessionRuntimeModule {}
