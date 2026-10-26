import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { SessionRuntimeModule } from '../session/session-runtime.module';
import { SessionService } from '../session/session.service';
import { IdentityProvider } from './identity.provider';
import { IdentityVerificationModule } from './identity-verification.module';

const sessions = { registerIdentityVerifier: jest.fn() };
@Module({
  providers: [
    { provide: SessionService, useValue: sessions },
    { provide: ConfigService, useValue: new ConfigService() },
  ],
  exports: [SessionService, ConfigService],
})
class RuntimeDependencies {}

describe('standalone identity verification startup', () => {
  it('registers fail-closed verification without the HTTP identity service, controller or audit service', async () => {
    sessions.registerIdentityVerifier.mockClear();
    const verify = jest.fn(async () => undefined);
    const module = await Test.createTestingModule({
      imports: [IdentityVerificationModule],
    })
      .overrideModule(SessionRuntimeModule)
      .useModule(RuntimeDependencies)
      .overrideProvider(IdentityProvider)
      .useValue({ verify })
      .compile();
    await module.init();
    expect(sessions.registerIdentityVerifier).toHaveBeenCalledTimes(1);
    const verifier = sessions.registerIdentityVerifier.mock.calls[0][0];
    const metadata = { issuer: 'https://id.example', subject: 'subject' };
    await verifier(metadata);
    expect(verify).toHaveBeenCalledWith(metadata);
    await module.close();
  });
});
