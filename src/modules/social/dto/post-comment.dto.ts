import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** Longest comment / reply accepted, in characters. */
export const MAX_COMMENT_LENGTH = 4000;

export class PostCommentDto {
  @ApiProperty({
    example: 'Margins look stretched — what am I missing?',
    description: `Comment text, at most ${MAX_COMMENT_LENGTH} characters.`,
  })
  @IsString()
  @MaxLength(MAX_COMMENT_LENGTH)
  @Matches(/\S/, { message: 'content must not be empty' })
  content: string;

  @ApiProperty({
    required: false,
    nullable: true,
    example: '42',
    description: 'Id of the comment this one replies to (same ticker).',
  })
  @IsOptional()
  // Comment ids are bigints serialized as strings; tolerate a JSON number.
  @Transform(({ value }) => (typeof value === 'number' ? String(value) : value))
  @Matches(/^\d{1,18}$/, { message: 'parent_id must be a numeric comment id' })
  parent_id?: string | null;
}
