import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class SidebarCategorySpaceDto {
  @IsUUID()
  spaceId: string;
}

export class CreateSidebarCategoryDto extends SidebarCategorySpaceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(24)
  name: string;
}

export class UpdateSidebarCategoryDto {
  @IsUUID()
  categoryId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(24)
  name: string;
}

export class DeleteSidebarCategoryDto {
  @IsUUID()
  categoryId: string;
}

export class ReorderSidebarCategoriesDto extends SidebarCategorySpaceDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  orderedCategoryIds: string[];
}
