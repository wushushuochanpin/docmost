import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class ListBackupJobsDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === undefined ? undefined : Number(value),
  )
  @Min(1)
  limit?: number;
}

export class BackupJobIdDto {
  @IsUUID()
  id: string;
}

export class BackupRunDto {
  @IsOptional()
  @IsBoolean()
  cleanupOnly?: boolean;
}
