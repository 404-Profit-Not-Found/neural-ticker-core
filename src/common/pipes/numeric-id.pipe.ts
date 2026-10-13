import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

/**
 * Validates a route param that addresses a row by its bigint id
 * (research notes, comments). The id is kept as a STRING — that is how the
 * bigint columns are typed and compared throughout the code — so this checks
 * the shape instead of converting like ParseIntPipe would.
 *
 * Without it a non-numeric id reaches Postgres and fails the query
 * ("invalid input syntax for type bigint"), i.e. an HTTP 500. At most 18
 * digits, so the value always fits a bigint.
 */
@Injectable()
export class NumericIdPipe implements PipeTransform<unknown, string> {
  transform(value: unknown): string {
    if (typeof value !== 'string' || !/^\d{1,18}$/.test(value)) {
      throw new BadRequestException('Invalid id: a numeric id is expected');
    }
    return value;
  }
}
