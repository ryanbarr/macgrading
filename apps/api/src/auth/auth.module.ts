import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { DevGoogleTokenVerifier } from './dev-token-verifier';
import {
  GOOGLE_TOKEN_VERIFIER,
  GoogleAuthTokenVerifier,
} from './google-token-verifier';

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '30d' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    {
      provide: GOOGLE_TOKEN_VERIFIER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get<string>('AUTH_DEV_MODE') === 'true'
          ? new DevGoogleTokenVerifier()
          : new GoogleAuthTokenVerifier(config),
    },
  ],
})
export class AuthModule {}
