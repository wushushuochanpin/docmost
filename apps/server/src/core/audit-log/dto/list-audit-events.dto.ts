import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class ListAuditEventsDto extends PaginationOptions {
  @IsOptional()
  @IsString()
  event?: string;

  @IsOptional()
  @IsString()
  resourceType?: string;

  @IsOptional()
  @IsString()
  actorId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
