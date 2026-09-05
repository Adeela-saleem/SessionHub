import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail, IsEnum, IsInt, IsOptional, IsString,
  Matches, MaxLength, MinLength,
} from 'class-validator';

/** Only these two are self-registerable. ADMIN is deliberately absent. */
export enum SignupRole {
  STUDENT = 'STUDENT',
  TEACHER = 'TEACHER',
}

const PASSWORD_RULE =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

/** Letters only (any script), with spaces, apostrophes, hyphens and
    dots between them. Digits are rejected outright — a name is not an
    ID, and "12345" must not become a display name. Shared with the
    profile editor so both entry points agree. */
export const NAME_RULE = /^\p{L}[\p{L} '.-]*$/u;
export const NAME_MESSAGE = 'Name may only contain letters, spaces, apostrophes and hyphens';

export class SignupDto {
  @ApiProperty({ example: 'ada@university.edu' })
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(160)
  email!: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Matches(NAME_RULE, { message: NAME_MESSAGE })
  name!: string;

  @ApiProperty({ description: 'Min 8 chars with upper, lower, number and symbol' })
  @IsString()
  @MaxLength(128)
  @Matches(PASSWORD_RULE, {
    message: 'Password needs at least 8 characters including an uppercase letter, a lowercase letter, a number and a symbol',
  })
  password!: string;

  @ApiProperty({ enum: SignupRole })
  @IsEnum(SignupRole, { message: 'Role must be STUDENT or TEACHER' })
  role!: SignupRole;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(80)
  department?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsInt()
  year?: number;
}

export class LoginDto {
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty() @IsString() @MaxLength(128) password!: string;
}

export class RefreshDto {
  @ApiProperty() @IsString() refreshToken!: string;
}

export class ChangePasswordDto {
  @ApiProperty() @IsString() @MaxLength(128) currentPassword!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(128)
  @Matches(PASSWORD_RULE, {
    message: 'Password needs at least 8 characters including an uppercase letter, a lowercase letter, a number and a symbol',
  })
  newPassword!: string;
}
