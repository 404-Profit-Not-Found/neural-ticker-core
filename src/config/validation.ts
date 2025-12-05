import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsString,
  IsUrl,
  IsOptional,
  IsBooleanString,
  Min,
  Max,
  validateSync,
} from 'class-validator';

enum Environment {
  Local = 'local',
  Dev = 'dev',
  Prod = 'prod',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  APP_ENV: Environment;

  @IsNumber()
  @IsOptional()
  APP_PORT: number;

  @IsString()
  DATABASE_URL: string;

  @IsString()
  FINNHUB_API_KEY: string;

  @IsUrl()
  @IsOptional()
  FINNHUB_BASE_URL: string;

  @IsString()
  OPENAI_API_KEY: string;

  @IsUrl()
  @IsOptional()
  OPENAI_BASE_URL: string;

  @IsString()
  GEMINI_API_KEY: string;

  @IsBooleanString()
  @IsOptional()
  RRSCORE_ENABLED: string;

  @IsString()
  @IsOptional()
  RRSCORE_CRON_EXPRESSION: string;

  @IsNumber()
  @IsOptional()
  RRSCORE_MAX_AGE_HOURS: number;

  @IsNumber()
  @Min(1)
  @Max(500)
  @IsOptional()
  RRSCORE_BATCH_SIZE: number;

  @IsString()
  @IsOptional()
  RRSCORE_PROVIDER: string;

  @IsNumber()
  @IsOptional()
  HTTP_READ_TIMEOUT_SEC: number;

  @IsNumber()
  @IsOptional()
  HTTP_WRITE_TIMEOUT_SEC: number;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  return validatedConfig;
}
