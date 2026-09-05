import { IsDateString, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AnnouncementPriority, ContentStatus } from '@prisma/client';

export class CreateAnnouncementDto {
  @IsString() @MinLength(2) @MaxLength(200)
  title!: string;

  @IsString() @MinLength(1) @MaxLength(20_000)
  body!: string;

  @IsOptional() @IsEnum(AnnouncementPriority)
  priority?: AnnouncementPriority;

  @IsOptional() @IsEnum(ContentStatus)
  status?: ContentStatus;

  @IsOptional() @IsDateString()
  publishAt?: string;
}

export class UpdateAnnouncementDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200)
  title?: string;

  @IsOptional() @IsString() @MinLength(1) @MaxLength(20_000)
  body?: string;

  @IsOptional() @IsEnum(AnnouncementPriority)
  priority?: AnnouncementPriority;

  @IsOptional() @IsEnum(ContentStatus)
  status?: ContentStatus;

  @IsOptional() @IsDateString()
  publishAt?: string;
}
