import { IsOptional, IsString, IsUUID } from 'class-validator';

export class SidebarCategoryAssignmentDto {
  @IsString()
  pageId: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string | null;
}
