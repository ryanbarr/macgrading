import { Module } from '@nestjs/common';
import { CardCatalogService } from './card-catalog.service';
import { CardsController } from './cards.controller';
import { StubCardCatalogService } from './stub-card-catalog.service';

@Module({
  controllers: [CardsController],
  providers: [{ provide: CardCatalogService, useClass: StubCardCatalogService }],
  exports: [CardCatalogService],
})
export class CardsModule {}
