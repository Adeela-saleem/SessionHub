import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuditService } from './audit.service';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit')
export class AuditController {
  constructor(private audit: AuditService) {}

  /** Administrators only: the log records who did what to whom. */
  @Roles(Role.ADMIN)
  @Get()
  list(
    @Query('take') take?: number,
    @Query('cursor') cursor?: string,
    @Query('action') action?: string,
    @Query('targetType') targetType?: string,
  ) {
    return this.audit.list({ take, cursor, action, targetType });
  }
}
