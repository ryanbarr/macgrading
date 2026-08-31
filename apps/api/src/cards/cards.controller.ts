import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { CheckPolicies } from '../auth/check-policies.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PoliciesGuard } from '../auth/policies.guard';
import { CardCatalogService } from './card-catalog.service';

class SearchCardsQuery {
  @IsString()
  @MinLength(2)
  q!: string;
}

@Controller('cards')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class CardsController {
  constructor(private readonly catalog: CardCatalogService) {}

  @Get('search')
  @CheckPolicies((ability) => ability.can('read', 'Card'))
  search(@Query() query: SearchCardsQuery) {
    return this.catalog.search(query.q);
  }
}
