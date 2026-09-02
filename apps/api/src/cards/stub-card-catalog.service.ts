import { Injectable } from '@nestjs/common';
import { CardDetailDto } from '@macgrading/shared';
import { CardCatalogService } from './card-catalog.service';

const BLANK_DETAIL = {
  cardImageUrl: null,
  cardThumbUrl: null,
  variants: [] as string[],
  rarity: null,
  supertype: null,
  subtypes: [] as string[],
  types: [] as string[],
  artist: null,
  hp: null,
  languageCode: 'EN',
  nationalPokedexNumbers: [] as number[],
  setSeries: null,
  setTotal: null,
  setReleaseDate: null,
  originalName: null,
  originalSetName: null,
};

const STUB_CARDS: CardDetailDto[] = [
  { ...BLANK_DETAIL, cardboardTensId: 'cbt-0001', cardName: 'Charizard', setName: 'Base Set', cardNumber: '4/102', releaseYear: 1999, category: 'Pokemon', variants: ['Holofoil', '1st Edition'], rarity: 'Rare Holo', supertype: 'Pokémon', subtypes: ['Stage 2'], types: ['Fire'], artist: 'Mitsuhiro Arita', hp: '120', nationalPokedexNumbers: [6], setSeries: 'Base', setTotal: 102, setReleaseDate: '1999-01-09' },
  { ...BLANK_DETAIL, cardboardTensId: 'cbt-0002', cardName: 'Pikachu', setName: 'Jungle', cardNumber: '60/64', releaseYear: 1999, category: 'Pokemon', variants: ['1st Edition'], rarity: 'Common', supertype: 'Pokémon', subtypes: ['Basic'], types: ['Lightning'], artist: 'Mitsuhiro Arita', hp: '40', nationalPokedexNumbers: [25], setSeries: 'Base', setTotal: 64, setReleaseDate: '1999-06-16' },
  { ...BLANK_DETAIL, cardboardTensId: 'cbt-0003', cardName: 'Blastoise', setName: 'Base Set', cardNumber: '2/102', releaseYear: 1999, category: 'Pokemon', variants: ['Holofoil', 'Shadowless'], rarity: 'Rare Holo', supertype: 'Pokémon', subtypes: ['Stage 2'], types: ['Water'], artist: 'Ken Sugimori', hp: '100', nationalPokedexNumbers: [9], setSeries: 'Base', setTotal: 102, setReleaseDate: '1999-01-09' },
  { ...BLANK_DETAIL, cardboardTensId: 'cbt-0004', cardName: 'Black Lotus', setName: 'Alpha', cardNumber: null, releaseYear: 1993, category: 'Magic: The Gathering', rarity: 'Rare', artist: 'Christopher Rush' },
  { ...BLANK_DETAIL, cardboardTensId: 'cbt-0005', cardName: 'Ken Griffey Jr.', setName: 'Upper Deck', cardNumber: '1', releaseYear: 1989, category: 'Baseball', rarity: 'Star Rookie' },
  { ...BLANK_DETAIL, cardboardTensId: 'cbt-0006', cardName: 'Michael Jordan', setName: 'Fleer', cardNumber: '57', releaseYear: 1986, category: 'Basketball', rarity: 'Rookie' },
  { ...BLANK_DETAIL, cardboardTensId: 'cbt-0007', cardName: 'Blue-Eyes White Dragon', setName: 'Legend of Blue Eyes', cardNumber: 'LOB-001', releaseYear: 2002, category: 'Yu-Gi-Oh!', variants: ['Ultra Rare'], rarity: 'Ultra Rare' },
  { ...BLANK_DETAIL, cardboardTensId: 'cbt-0008', cardName: 'Wayne Gretzky', setName: 'O-Pee-Chee', cardNumber: '18', releaseYear: 1979, category: 'Hockey', rarity: 'Rookie' },
];

@Injectable()
export class StubCardCatalogService extends CardCatalogService {
  async search(query: string): Promise<CardDetailDto[]> {
    const q = query.toLowerCase();
    return STUB_CARDS.filter(
      (card) =>
        card.cardName.toLowerCase().includes(q) ||
        card.setName.toLowerCase().includes(q) ||
        (card.category ?? '').toLowerCase().includes(q),
    );
  }

  async getById(cardboardTensId: string): Promise<CardDetailDto | null> {
    return (
      STUB_CARDS.find((card) => card.cardboardTensId === cardboardTensId) ??
      null
    );
  }
}
