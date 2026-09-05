import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateSessionDto {
  @ApiProperty() @IsUUID() courseId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) title?: string;
}

export class JoinSessionDto {
  @ApiProperty({ example: 'DBMS7K' })
  @Transform(({ value }) => String(value ?? '').trim().toUpperCase())
  @IsString()
  @Length(6, 6, { message: 'A room code is exactly 6 characters' })
  roomCode!: string;
}
