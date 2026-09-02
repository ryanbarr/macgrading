import { ConfigService } from '@nestjs/config';
import { CardboardTensCardCatalogService } from './cardboardtens-card-catalog.service';
import { createCardCatalogService } from './cards.module';
import { StubCardCatalogService } from './stub-card-catalog.service';

function fakeConfig(values: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      const value = values[key];
      if (value === undefined) throw new Error(`missing ${key}`);
      return value;
    },
  } as unknown as ConfigService;
}

describe('createCardCatalogService', () => {
  it('uses the live CardboardTens service when a key is configured', () => {
    const service = createCardCatalogService(
      fakeConfig({ CARDBOARDTENS_API_KEY: 'ct_live_x' }),
    );
    expect(service).toBeInstanceOf(CardboardTensCardCatalogService);
  });

  it('falls back to the stub without a key', () => {
    const service = createCardCatalogService(fakeConfig({}));
    expect(service).toBeInstanceOf(StubCardCatalogService);
  });
});
