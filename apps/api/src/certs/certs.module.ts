import { Module } from '@nestjs/common';
import { CardsModule } from '../cards/cards.module';
import { StorageModule } from '../storage/storage.module';
import { CertsController } from './certs.controller';
import { CertsService } from './certs.service';
import { PhotosController } from './photos.controller';

@Module({
  imports: [CardsModule, StorageModule],
  controllers: [CertsController, PhotosController],
  providers: [CertsService],
})
export class CertsModule {}
