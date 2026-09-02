import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { validateEnv } from './config/env.validation';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { AuthModule } from './auth/auth.module';
import { GradeNamesModule } from './grade-names/grade-names.module';
import { UsersModule } from './users/users.module';
import { CardsModule } from './cards/cards.module';
import { CertsModule } from './certs/certs.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: Number(config.get('THROTTLE_TTL_SECONDS') ?? 60) * 1000,
            limit: Number(config.get('THROTTLE_LIMIT') ?? 120),
          },
        ],
      }),
    }),
    PrismaModule,
    AuthModule,
    GradeNamesModule,
    UsersModule,
    CardsModule,
    CertsModule,
  ],
  controllers: [AppController, HealthController],
  providers: [
    {
      provide: APP_PIPE,
      // forbidNonWhitelisted: silently stripping unknown fields once turned a
      // TEST-mode mint into a live cert (stale server + new client). Unknown
      // properties must fail loudly, not vanish.
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
