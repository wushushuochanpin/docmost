import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  MAX_PROTECTED_SHARE_TTL_MINUTES,
  MIN_PROTECTED_SHARE_TTL_MINUTES,
  ShareAccessMode,
} from '../share.constants';

export class CreateShareDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;

  @IsBoolean()
  @IsOptional()
  includeSubPages: boolean;

  @IsOptional()
  @IsBoolean()
  searchIndexing: boolean;

  @IsOptional()
  @IsString()
  @IsIn([ShareAccessMode.Public, ShareAccessMode.PasswordExpiring])
  accessMode?: ShareAccessMode;

  @ValidateIf((dto: CreateShareDto) =>
    (dto.accessMode ?? ShareAccessMode.Public) ===
    ShareAccessMode.PasswordExpiring,
  )
  @IsNumber()
  @Min(MIN_PROTECTED_SHARE_TTL_MINUTES)
  @Max(MAX_PROTECTED_SHARE_TTL_MINUTES)
  expiresInMinutes?: number;
}

export class UpdateShareDto extends CreateShareDto {
  @IsString()
  @IsNotEmpty()
  shareId: string;

  @IsString()
  @IsOptional()
  pageId: string;
}

export class ShareIdDto {
  @IsString()
  @IsNotEmpty()
  shareId: string;

  @IsOptional()
  @IsString()
  accessToken?: string;

  @IsOptional()
  @IsBoolean()
  metadataOnly?: boolean;
}

export class SpaceIdDto {
  @IsUUID()
  spaceId: string;
}

export class ShareInfoDto {
  @IsString()
  @IsOptional()
  shareId?: string;

  @IsString()
  @IsOptional()
  pageId: string;

  @IsOptional()
  @IsString()
  accessToken?: string;
}

export class SharePageSegmentDto extends ShareInfoDto {
  @IsString()
  @IsNotEmpty()
  cursor: string;
}

export class ShareWechatSignatureDto {
  @IsString()
  @IsNotEmpty()
  @IsUrl({ protocols: ['http', 'https'], require_tld: false })
  url: string;
}

export class SharePageIdDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;
}

export class VerifyShareAccessDto {
  @IsString()
  @IsNotEmpty()
  shareId: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

export class RegenerateProtectedShareDto {
  @IsString()
  @IsNotEmpty()
  shareId: string;

  @IsString()
  @IsNotEmpty()
  @IsIn([ShareAccessMode.Public, ShareAccessMode.PasswordExpiring])
  accessMode: ShareAccessMode;

  @IsOptional()
  @IsBoolean()
  includeSubPages?: boolean;

  @IsOptional()
  @IsBoolean()
  searchIndexing?: boolean;

  @IsOptional()
  @IsBoolean()
  keepLink?: boolean;

  @ValidateIf((dto: RegenerateProtectedShareDto) =>
    dto.accessMode === ShareAccessMode.PasswordExpiring,
  )
  @IsNumber()
  @Min(MIN_PROTECTED_SHARE_TTL_MINUTES)
  @Max(MAX_PROTECTED_SHARE_TTL_MINUTES)
  expiresInMinutes?: number;
}
