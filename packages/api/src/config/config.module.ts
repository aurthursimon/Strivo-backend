import { Global, Module, Logger } from '@nestjs/common';
import { envSchema } from './env.schema';
import type { Env } from './env.schema';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Local secrets stay in an ignored file; deployment environment still takes precedence.
dotenv.config({ path: resolve(__dirname, '../../.env.local') });
dotenv.config({ path: resolve(__dirname, '../../.env') });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const logger = new Logger('ConfigModule');
  logger.error('Invalid environment variables:');
  for (const issue of parsed.error.issues) {
    logger.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

const ENV_TOKEN = Symbol('ENV');

@Global()
@Module({
  providers: [
    {
      provide: ENV_TOKEN,
      useValue: parsed.data,
    },
  ],
  exports: [ENV_TOKEN],
})
export class ConfigModule {}

export { ENV_TOKEN };
export type { Env };
