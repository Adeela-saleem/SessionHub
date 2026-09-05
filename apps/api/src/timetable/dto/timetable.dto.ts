import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

const TIME = /^([01]?\d|2[0-3]):[0-5]\d$/;

export class CreateSlotDto {
  @IsInt() @Min(0) @Max(6)
  dayOfWeek!: number;

  @IsString() @Matches(TIME, { message: 'startTime must be HH:MM' })
  startTime!: string;

  @IsString() @Matches(TIME, { message: 'endTime must be HH:MM' })
  endTime!: string;

  @IsOptional() @IsString() @MaxLength(80)
  room?: string;
}

export class UpdateSlotDto {
  @IsOptional() @IsInt() @Min(0) @Max(6)
  dayOfWeek?: number;

  @IsOptional() @IsString() @Matches(TIME, { message: 'startTime must be HH:MM' })
  startTime?: string;

  @IsOptional() @IsString() @Matches(TIME, { message: 'endTime must be HH:MM' })
  endTime?: string;

  @IsOptional() @IsString() @MaxLength(80)
  room?: string;
}
