import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Largest single admin gift, in credits. */
export const MAX_CREDIT_GIFT = 100000;

export class UpdateUserTierDto {
  @ApiProperty({ enum: ['free', 'pro', 'whale'] })
  @IsIn(['free', 'pro', 'whale'])
  tier: 'free' | 'pro' | 'whale';
}

export class GiftCreditsDto {
  @ApiProperty({ example: 10, minimum: 1, maximum: MAX_CREDIT_GIFT })
  @IsInt()
  @Min(1)
  @Max(MAX_CREDIT_GIFT)
  amount: number;

  @ApiProperty({
    required: false,
    example: 'Thanks for the bug report',
    description:
      'Free-text note stored with the transaction. The ledger reason is ' +
      "always 'admin_gift'.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class AddToUserlistDto {
  @ApiProperty({ example: 'new.user@example.com' })
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  addedBy?: string;
}
