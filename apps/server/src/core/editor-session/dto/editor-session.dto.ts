import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type {
  EditorSessionResourceType,
  EditorSessionWriteIntent,
} from '../editor-session.types';

export class EditSessionDto {
  @IsString()
  sessionId: string;

  @IsString()
  clientId: string;

  @IsString()
  leaseId: string;

  @IsInt()
  @Min(1)
  token: number;

  @IsOptional()
  @IsString()
  takeoverId?: string;
}

export class AcquireEditorSessionDto {
  @IsIn(['page', 'file'])
  resourceType: EditorSessionResourceType;

  @IsUUID()
  resourceId: string;

  @IsString()
  clientId: string;
}

export class HeartbeatEditorSessionDto {
  @IsIn(['page', 'file'])
  resourceType: EditorSessionResourceType;

  @IsUUID()
  resourceId: string;

  @ValidateNested()
  @Type(() => EditSessionDto)
  editSession: EditSessionDto;
}

export class ReleaseEditorSessionDto extends HeartbeatEditorSessionDto {
  @IsOptional()
  @IsIn(['unload', 'takeover_ack', 'manual'])
  reason?: 'unload' | 'takeover_ack' | 'manual';
}

export class EditorSessionWriteDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => EditSessionDto)
  editSession?: EditSessionDto;

  @IsOptional()
  @IsIn(['normal', 'handoff_flush'])
  writeIntent?: EditorSessionWriteIntent;
}
