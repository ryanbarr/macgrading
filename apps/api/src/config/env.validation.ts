import { plainToInstance } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsNotEmpty,
  validateSync,
} from 'class-validator';

export class EnvironmentVariables {
  @IsString() @IsNotEmpty() DATABASE_URL!: string;
  @IsString() @IsNotEmpty() JWT_SECRET!: string;
  @IsString() @IsNotEmpty() GOOGLE_CLIENT_ID!: string;
  @IsString() @IsNotEmpty() S3_ENDPOINT!: string;
  @IsString() @IsNotEmpty() S3_ACCESS_KEY!: string;
  @IsString() @IsNotEmpty() S3_SECRET_KEY!: string;
  @IsString() @IsNotEmpty() S3_BUCKET!: string;
  @IsString() @IsNotEmpty() S3_REGION!: string;
  @IsOptional() @IsString() S3_PUBLIC_URL?: string;
  @IsOptional() @IsString() ADMIN_EMAILS?: string;
  @IsOptional() @IsString() AUTH_DEV_MODE?: string;
  @IsOptional() @IsString() CORS_ORIGIN?: string;
  @IsOptional() @IsString() THROTTLE_TTL_SECONDS?: string;
  @IsOptional() @IsString() THROTTLE_LIMIT?: string;
  @IsOptional() @IsString() CARDBOARDTENS_API_KEY?: string;
  @IsOptional() @IsString() CARDBOARDTENS_API_URL?: string;
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const missing = errors.map((e) => e.property).join(', ');
    throw new Error(`Invalid environment configuration: ${missing}`);
  }
  return validated;
}
