import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { PageNodeType } from '@docmost/db/repos/page/page-node-meta.repo';

export type ContentFormat = 'json' | 'markdown' | 'html';
export type ThemeColor = 'white' | 'yellow' | 'green' | 'blue' | 'pink';
export type ThemePattern = 'blank' | 'dots' | 'grid' | 'lines';

export class CreatePageDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  @IsIn(['white', 'yellow', 'green', 'blue', 'pink'])
  themeColor?: ThemeColor;

  @IsOptional()
  @IsString()
  @IsIn(['blank', 'dots', 'grid', 'lines'])
  themePattern?: ThemePattern;

  @IsOptional()
  @IsString()
  parentPageId?: string;

  @IsOptional()
  @IsIn(['file', 'folder'])
  nodeType?: PageNodeType;

  @IsUUID()
  spaceId: string;

  @IsOptional()
  content?: string | object;

  @ValidateIf((o) => o.content !== undefined)
  @Transform(({ value }) => value?.toLowerCase() ?? 'json')
  @IsIn(['json', 'markdown', 'html'])
  format?: ContentFormat;
}
