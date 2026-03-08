import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateIntegrationTokenDto {
  @IsString()
  @MaxLength(64)
  name: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
