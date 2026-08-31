import { Injectable } from '@nestjs/common';
import { CardSummary } from '@macgrading/shared';
import { CardCatalogService } from './card-catalog.service';

const STUB_CARDS: CardSummary[] = [
  { cardboardTensId: 'cbt-0001', cardName: 'Charizard', setName: 'Base Set', cardNumber: '4/102', releaseYear: 1999, category: 'Pokemon', cardImageUrl: null },
  { cardboardTensId: 'cbt-0002', cardName: 'Pikachu', setName: 'Jungle', cardNumber: '60/64', releaseYear: 1999, category: 'Pokemon', cardImageUrl: null },
  { cardboardTensId: 'cbt-0003', cardName: 'Blastoise', setName: 'Base Set', cardNumber: '2/102', releaseYear: 1999, category: 'Pokemon', cardImageUrl: null },
  { cardboardTensId: 'cbt-0004', cardName: 'Black Lotus', setName: 'Alpha', cardNumber: null, releaseYear: 1993, category: 'Magic: The Gathering', cardImageUrl: null },
  { cardboardTensId: 'cbt-0005', cardName: 'Ken Griffey Jr.', setName: 'Upper Deck', cardNumber: '1', releaseYear: 1989, category: 'Baseball', cardImageUrl: null },
  { cardboardTensId: 'cbt-0006', cardName: 'Michael Jordan', setName: 'Fleer', cardNumber: '57', releaseYear: 1986, category: 'Basketball', cardImageUrl: null },
  { cardboardTensId: 'cbt-0007', cardName: 'Blue-Eyes White Dragon', setName: 'Legend of Blue Eyes', cardNumber: 'LOB-001', releaseYear: 2002, category: 'Yu-Gi-Oh!', cardImageUrl: null },
  { cardboardTensId: 'cbt-0008', cardName: 'Wayne Gretzky', setName: 'O-Pee-Chee', cardNumber: '18', releaseYear: 1979, category: 'Hockey', cardImageUrl: null },
];

@Injectable()
export class StubCardCatalogService extends CardCatalogService {
  async search(query: string): Promise<CardSummary[]> {
    const q = query.toLowerCase();
    return STUB_CARDS.filter(
      (card) =>
        card.cardName.toLowerCase().includes(q) ||
        card.setName.toLowerCase().includes(q) ||
        (card.category ?? '').toLowerCase().includes(q),
    );
  }

  async getById(cardboardTensId: string): Promise<CardSummary | null> {
    return STUB_CARDS.find((card) => card.cardboardTensId === cardboardTensId) ?? null;
  }
}
