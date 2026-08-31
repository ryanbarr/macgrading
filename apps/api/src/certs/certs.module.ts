import { Module } from '@nestjs/common';
import { CardsModule } from '../cards/cards.module';
import { CertsController } from './certs.controller';
import { CertsService } from './certs.service';

@Module({
  imports: [CardsModule],
  controllers: [CertsController],
  providers: [CertsService],
})
export class CertsModule {}
