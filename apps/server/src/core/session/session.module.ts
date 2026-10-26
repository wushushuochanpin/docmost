import { Global, Module } from '@nestjs/common';
import { SessionController } from './session.controller';
import { SessionRuntimeModule } from './session-runtime.module';

@Global()
@Module({
  imports: [SessionRuntimeModule],
  controllers: [SessionController],
  exports: [SessionRuntimeModule],
})
export class SessionModule {}
