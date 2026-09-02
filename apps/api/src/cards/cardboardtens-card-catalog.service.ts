import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CardDetailDto } from '@macgrading/shared';
import { CardCatalogService } from './card-catalog.service';

interface CardboardTensSet {
  id: string;
  name: string;
  nameEn: string;
  series: string;
  releaseDate: string;
  total: number;
}

interface CardboardTensCard {
  id: string;
  name: string;
  nameEn: string;
  languageCode: string | null;
  number: string;
  rarity: string | null;
  set: CardboardTensSet;
  images: { small: string | null; large: string | null };
  variants: string[];
  supertype: string | null;
  subtypes: string[];
  types: string[];
  nationalPokedexNumbers: number[];
  artist: string | null;
  hp: string | null;
}

interface CardboardTensSearchResponse {
  cards: CardboardTensCard[];
  total: number;
  page: number;
}

const DEFAULT_BASE_URL = 'https://www.cardboardtens.com/api/v1';

/** CardboardTens sends camelCase variant tokens ("reverseHolo") — humanize
 *  to label-ready text ("Reverse Holo") so the whole stack, including cert
 *  snapshots, stores display form. */
export function humanizeVariant(raw: string): string {
  return raw
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
const SEARCH_LIMIT = 25;
const MAX_RETRY_AFTER_SECONDS = 5;
const SERVER_ERROR_RETRY_SECONDS = 0.5;

/**
 * Live CardboardTens Developer API implementation of the card catalog.
 * Selected by CardsModule only when CARDBOARDTENS_API_KEY is configured;
 * the stub serves otherwise. Read-only: search + single-card lookup.
 */
@Injectable()
export class CardboardTensCardCatalogService extends CardCatalogService {
  private readonly logger = new Logger(CardboardTensCardCatalogService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: ConfigService) {
    super();
    this.apiKey = config.getOrThrow<string>('CARDBOARDTENS_API_KEY');
    this.baseUrl = (
      config.get<string>('CARDBOARDTENS_API_URL') ?? DEFAULT_BASE_URL
    ).replace(/\/$/, '');
  }

  async search(query: string): Promise<CardDetailDto[]> {
    const params = new URLSearchParams({
      q: query,
      limit: String(SEARCH_LIMIT),
    });
    const body = await this.request<CardboardTensSearchResponse>(
      `/cards?${params.toString()}`,
    );
    return body.cards.map((card) => this.toCardDetail(card));
  }

  async getById(cardboardTensId: string): Promise<CardDetailDto | null> {
    const body = await this.request<CardboardTensCard | null>(
      `/cards/${encodeURIComponent(cardboardTensId)}`,
      { nullOn404: true },
    );
    return body ? this.toCardDetail(body) : null;
  }

  private async request<T>(
    path: string,
    options: { nullOn404?: boolean } = {},
    attempt = 0,
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: { 'x-api-key': this.apiKey },
    });

    if (response.status === 404 && options.nullOn404) {
      return null as T;
    }
    if (response.status === 401) {
      throw new Error(
        'CardboardTens rejected the API key — check CARDBOARDTENS_API_KEY',
      );
    }
    if ((response.status === 429 || response.status >= 500) && attempt < 1) {
      const retryAfterSeconds =
        response.status === 429
          ? Math.min(
              Number(response.headers.get('Retry-After') ?? 1) || 1,
              MAX_RETRY_AFTER_SECONDS,
            )
          : SERVER_ERROR_RETRY_SECONDS;
      this.logger.warn(
        `CardboardTens responded ${response.status}; retrying in ${retryAfterSeconds}s`,
      );
      await new Promise((resolve) =>
        setTimeout(resolve, retryAfterSeconds * 1000),
      );
      return this.request<T>(path, options, attempt + 1);
    }
    if (!response.ok) {
      throw new Error(`CardboardTens API error ${response.status}`);
    }
    return (await response.json()) as T;
  }

  private toCardDetail(card: CardboardTensCard): CardDetailDto {
    const releaseYear = Number(card.set.releaseDate?.slice(0, 4));
    return {
      cardboardTensId: card.id,
      cardName: card.nameEn,
      setName: card.set.nameEn,
      cardNumber:
        card.set.total > 0 ? `${card.number}/${card.set.total}` : card.number,
      releaseYear: Number.isFinite(releaseYear) ? releaseYear : null,
      category: 'Pokémon',
      cardImageUrl: card.images.large ?? card.images.small,
      cardThumbUrl: card.images.small ?? card.images.large,
      variants: card.variants.map(humanizeVariant),
      rarity: card.rarity,
      supertype: card.supertype,
      subtypes: card.subtypes,
      types: card.types,
      artist: card.artist,
      hp: card.hp,
      languageCode: card.languageCode,
      nationalPokedexNumbers: card.nationalPokedexNumbers,
      setSeries: card.set.series || null,
      setTotal: card.set.total > 0 ? card.set.total : null,
      setReleaseDate: card.set.releaseDate || null,
      originalName: card.name !== card.nameEn ? card.name : null,
      originalSetName: card.set.name !== card.set.nameEn ? card.set.name : null,
    };
  }
}
