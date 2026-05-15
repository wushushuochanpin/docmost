import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export class SidebarPageDto {
  @IsOptional()
  @IsUUID()
  spaceId: string;

  @IsOptional()
  @IsString()
  pageId: string;

  @IsOptional()
  @Transform(({ value }) => value?.toLowerCase())
  @IsIn(['all', 'pinned', 'category'])
  viewMode?: 'all' | 'pinned' | 'category';

  @IsOptional()
  @IsUUID()
  categoryId?: string;
}
