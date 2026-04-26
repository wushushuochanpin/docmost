import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  IsNotEmpty,
} from 'class-validator';

export class MovePageDto {
  @IsString()
  pageId: string;

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(12)
  position?: string | null;

  @IsOptional()
  @IsString()
  parentPageId?: string | null;
}

export class MovePageToSpaceDto {
  @IsNotEmpty()
  @IsString()
  pageId: string;

  @IsNotEmpty()
  @IsString()
  spaceId: string;
}
