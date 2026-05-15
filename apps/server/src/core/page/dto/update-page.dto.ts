import { PartialType } from '@nestjs/mapped-types';
import { CreatePageDto, ContentFormat } from './create-page.dto';
import {
  IsIn,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { EditSessionDto } from '../../editor-session/dto/editor-session.dto';
import type { EditorSessionWriteIntent } from '../../editor-session/editor-session.types';

export type ContentOperation = 'append' | 'prepend' | 'replace';

export class UpdatePageDto extends PartialType(CreatePageDto) {
  @IsString()
  pageId: string;

  @IsOptional()
  content?: string | object;

  @ValidateIf((o) => o.content !== undefined)
  @Transform(({ value }) => value?.toLowerCase())
  @IsIn(['append', 'prepend', 'replace'])
  operation?: ContentOperation;

  @ValidateIf((o) => o.content !== undefined)
  @Transform(({ value }) => value?.toLowerCase() ?? 'json')
  @IsIn(['json', 'markdown', 'html'])
  format?: ContentFormat;

  @IsOptional()
  @ValidateNested()
  @Type(() => EditSessionDto)
  editSession?: EditSessionDto;

  @IsOptional()
  @Transform(({ value }) => value?.toLowerCase())
  @IsIn(['normal', 'handoff_flush'])
  writeIntent?: EditorSessionWriteIntent;
}
