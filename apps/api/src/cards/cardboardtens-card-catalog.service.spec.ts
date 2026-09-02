import { ConfigService } from '@nestjs/config';
import { CardboardTensCardCatalogService } from './cardboardtens-card-catalog.service';

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

const charizard = {
  id: 'base1-4',
  name: 'Charizard',
  nameEn: 'Charizard',
  languageCode: 'EN',
  number: '4',
  rarity: 'Rare Holo',
  set: {
    id: 'base1',
    name: 'Base',
    nameEn: 'Base',
    series: 'Base',
    releaseDate: '1999-01-09',
    total: 102,
  },
  images: { small: 'https://img/small.png', large: 'https://img/large.png' },
  variants: ['holo', 'reverseHolo', '1stEdition', 'pokemonCenterStamp'],
  supertype: 'Pokémon',
  subtypes: ['Stage 2'],
  types: ['Fire'],
  nationalPokedexNumbers: [6],
  artist: 'Mitsuhiro Arita',
  hp: '120',
};

const segureibu = {
  ...charizard,
  id: 'sv2p_ja-27',
  name: 'セグレイブ',
  nameEn: 'Baxcalibur',
  languageCode: 'JA',
  number: '27',
  set: {
    id: 'sv2p_ja',
    name: 'スノーハザード',
    nameEn: 'Snow Hazard',
    series: 'Scarlet & Violet',
    releaseDate: '2023-04-14',
    total: 0,
  },
  images: { small: 'https://img/ja-small.png', large: null },
};

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}

describe('CardboardTensCardCatalogService', () => {
  const config = fakeConfig({
    CARDBOARDTENS_API_KEY: 'ct_live_test',
    CARDBOARDTENS_API_URL: 'https://ct.example/api/v1',
  });
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('search maps cards to CardSummary and sends the API key', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ cards: [charizard], total: 1, page: 1 }),
    );
    const service = new CardboardTensCardCatalogService(config);

    const results = await service.search('charizard');

    expect(results).toEqual([
      {
        cardboardTensId: 'base1-4',
        cardName: 'Charizard',
        setName: 'Base',
        cardNumber: '4/102',
        releaseYear: 1999,
        category: 'Pokémon',
        cardImageUrl: 'https://img/large.png',
        cardThumbUrl: 'https://img/small.png',
        variants: ['Holo', 'Reverse Holo', '1st Edition', 'Pokemon Center Stamp'],
        rarity: 'Rare Holo',
        supertype: 'Pokémon',
        subtypes: ['Stage 2'],
        types: ['Fire'],
        artist: 'Mitsuhiro Arita',
        hp: '120',
        languageCode: 'EN',
        nationalPokedexNumbers: [6],
        setSeries: 'Base',
        setTotal: 102,
        setReleaseDate: '1999-01-09',
        originalName: null,
        originalSetName: null,
      },
    ]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(
      'https://ct.example/api/v1/cards?q=charizard&limit=25',
    );
    expect((init.headers as Record<string, string>)['x-api-key']).toBe(
      'ct_live_test',
    );
  });

  it('maps non-English cards to their English fields with image fallback', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ cards: [segureibu], total: 1, page: 1 }),
    );
    const service = new CardboardTensCardCatalogService(config);

    const [result] = await service.search('baxcalibur');

    expect(result.cardName).toBe('Baxcalibur');
    expect(result.setName).toBe('Snow Hazard');
    expect(result.cardNumber).toBe('27'); // set.total 0 → bare number
    expect(result.releaseYear).toBe(2023);
    expect(result.cardImageUrl).toBe('https://img/ja-small.png'); // large null → small
    expect(result.cardThumbUrl).toBe('https://img/ja-small.png'); // small preferred for thumbs
    expect(result.originalName).toBe('セグレイブ'); // differs from English name
    expect(result.originalSetName).toBe('スノーハザード');
    expect(result.setTotal).toBeNull(); // 0 → null
    expect(result.setSeries).toBe('Scarlet & Violet');
  });

  it('getById returns null on 404', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ statusCode: 404 }, 404));
    const service = new CardboardTensCardCatalogService(config);

    await expect(service.getById('base1-999')).resolves.toBeNull();
  });

  it('getById maps a single card', async () => {
    fetchMock.mockResolvedValue(jsonResponse(charizard));
    const service = new CardboardTensCardCatalogService(config);

    const result = await service.getById('base1-4');

    expect(result?.cardboardTensId).toBe('base1-4');
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://ct.example/api/v1/cards/base1-4',
    );
  });

  it('retries once after a 429 using Retry-After', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ statusCode: 429 }, 429, { 'Retry-After': '0' }),
      )
      .mockResolvedValueOnce(jsonResponse({ cards: [charizard], total: 1, page: 1 }));
    const service = new CardboardTensCardCatalogService(config);

    const results = await service.search('charizard');

    expect(results).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries once after a 5xx, then succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ statusCode: 502 }, 502))
      .mockResolvedValueOnce(jsonResponse(charizard));
    const service = new CardboardTensCardCatalogService(config);

    await expect(service.getById('base1-4')).resolves.not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws a clear key error on 401 without retrying', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ statusCode: 401 }, 401));
    const service = new CardboardTensCardCatalogService(config);

    await expect(service.search('charizard')).rejects.toThrow(
      'CARDBOARDTENS_API_KEY',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
