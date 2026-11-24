import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser, CollectionResponse, ImportJobListItem } from '@peoplecore/shared';
import { AppError } from '../../common/app-error';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ImportsService, type ImportPresignResponse } from './imports.service';
import { ImportQueryDto, PresignImportDto } from './dto/imports.dto';

@ApiTags('Imports')
@RequirePermissions('imports.read')
@Controller('imports')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @RequirePermissions('imports.create')
  @Post('presign')
  presign(
    @Body() dto: PresignImportDto,
    @CurrentUser() user: AuthenticatedUser | null,
  ): Promise<ImportPresignResponse> {
    return this.importsService.presign(dto, this.requirePrincipal(user));
  }

  @RequirePermissions('imports.create')
  @Post(':id/start')
  start(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser | null,
  ): Promise<ImportJobListItem> {
    return this.importsService.start(id, this.requirePrincipal(user));
  }

  @Get()
  list(
    @Query() query: ImportQueryDto,
    @CurrentUser() user: AuthenticatedUser | null,
  ): Promise<CollectionResponse<ImportJobListItem>> {
    return this.importsService.list(query, this.requirePrincipal(user));
  }

  private requirePrincipal(user: AuthenticatedUser | null): AuthenticatedUser {
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Account is not available');
    return user;
  }
}
