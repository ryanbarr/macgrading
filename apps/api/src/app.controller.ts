import { Controller, Get } from '@nestjs/common';
import { isValidCertNumber } from '@macgrading/shared';

@Controller()
export class AppController {
  @Get('health')
  health(): { status: string; sharedLinked: boolean } {
    return { status: 'ok', sharedLinked: isValidCertNumber('000000001') };
  }
}
