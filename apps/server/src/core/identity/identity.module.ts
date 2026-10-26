import { Module } from '@nestjs/common';
import { IdentityVerificationModule } from './identity-verification.module';
import { IdentityController } from './identity.controller';
import { IdentityRepository } from './identity.repository';
import { IdentityService } from './identity.service';

@Module({
  imports: [IdentityVerificationModule],
  controllers: [IdentityController],
  providers: [IdentityRepository, IdentityService],
  exports: [IdentityService],
})
export class IdentityModule {}
