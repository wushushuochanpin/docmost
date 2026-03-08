import { IsUUID } from 'class-validator';

export class RevokeIntegrationTokenDto {
  @IsUUID()
  tokenId: string;
}
