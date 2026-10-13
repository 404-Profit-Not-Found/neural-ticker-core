import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { NICKNAME_MAX_LENGTH, NICKNAME_MIN_LENGTH } from '../nickname.rules';

/**
 * Body of PATCH /v1/users/me. With the global ValidationPipe
 * (`whitelist` + `forbidNonWhitelisted`) any other property is a 400.
 */
export class UpdateProfileDto {
  @ApiProperty({
    required: false,
    example: 'SuperTrader',
    description:
      `New nickname: ${NICKNAME_MIN_LENGTH}-${NICKNAME_MAX_LENGTH} characters, ` +
      'letters / digits / "." "_" "-", starting and ending with a letter or ' +
      'digit, not reserved, unique regardless of case (409 if taken). ' +
      'Sending the current nickname unchanged is always accepted.',
  })
  @IsOptional()
  @IsString()
  // Shape only. The rules above are enforced by UsersService when the value
  // actually CHANGES: the clients resend the current nickname with every
  // theme save, and a nickname that predates the rules must not turn those
  // requests into 400s.
  @MaxLength(100)
  nickname?: string;

  @ApiProperty({ required: false, enum: ['KISS', 'PRO'] })
  @IsOptional()
  @IsIn(['KISS', 'PRO'])
  view_mode?: string;

  @ApiProperty({ required: false, example: 'dark' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,32}$/, {
    message: 'theme must be a short theme identifier',
  })
  theme?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  has_onboarded?: boolean;

  @ApiProperty({
    required: false,
    description:
      'Accepted for compatibility (the profile page sends it) and ignored: ' +
      'the avatar comes from the identity provider.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  avatar_url?: string;
}
