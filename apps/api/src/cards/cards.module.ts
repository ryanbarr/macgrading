import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CardCatalogService } from './card-catalog.service';
import { CardboardTensCardCatalogService } from './cardboardtens-card-catalog.service';
import { CardsController } from './cards.controller';
import { StubCardCatalogService } from './stub-card-catalog.service';

/** Live catalog when an API key is configured; deterministic stub otherwise. */
export function createCardCatalogService(
  config: ConfigService,
): CardCatalogService {
  const logger = new Logger(CardsModule.name);
  if (config.get<string>('CARDBOARDTENS_API_KEY')) {
    logger.log('Card catalog: live CardboardTens API');
    return new CardboardTensCardCatalogService(config);
  }
  logger.log('Card catalog: built-in stub (CARDBOARDTENS_API_KEY not set)');
  return new StubCardCatalogService();
}

@Module({
  controllers: [CardsController],
  providers: [
    {
      provide: CardCatalogService,
      inject: [ConfigService],
      useFactory: createCardCatalogService,
    },
  ],
  exports: [CardCatalogService],
})
export class CardsModule {}
