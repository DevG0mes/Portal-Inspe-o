import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready() {
    const result = await this.health.readiness();
    if (result.status === 'unavailable') throw new ServiceUnavailableException(result);
    return result;
  }
}
