import { Module, OnModuleInit } from '@nestjs/common';
import { SessionRuntimeModule } from '../session/session-runtime.module';
import { SessionService } from '../session/session.service';
import { IdentityConfigService } from './identity.config';
import { IdentityProvider } from './identity.provider';

/** Provider verification is needed in both HTTP and standalone collaboration. */
@Module({
  imports: [SessionRuntimeModule],
  providers: [IdentityConfigService, IdentityProvider],
  exports: [IdentityConfigService, IdentityProvider],
})
export class IdentityVerificationModule implements OnModuleInit {
  constructor(
    private readonly sessions: SessionService,
    private readonly provider: IdentityProvider,
  ) {}

  onModuleInit(): void {
    this.sessions.registerIdentityVerifier((metadata) =>
      this.provider.verify(metadata),
    );
  }
}
