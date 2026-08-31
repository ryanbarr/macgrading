import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CheckPolicies } from '../auth/check-policies.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PoliciesGuard } from '../auth/policies.guard';
import { CertsService } from './certs.service';
import { CreateCertDto } from './dto/create-cert.dto';

@Controller('certs')
export class CertsController {
  constructor(private readonly certs: CertsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('create', 'Cert'))
  mint(@Body() dto: CreateCertDto) {
    return this.certs.mint(dto);
  }
}
