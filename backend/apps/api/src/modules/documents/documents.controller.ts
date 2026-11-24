import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser, CollectionResponse, DocumentListItem } from '@peoplecore/shared';
import { AppError } from '../../common/app-error';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { DocumentsService, type DownloadResponse, type PresignResponse } from './documents.service';
import { ConfirmDocumentDto, DocumentQueryDto, PresignDocumentDto } from './dto/documents.dto';

@ApiTags('Documents')
@RequirePermissions('documents.read')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @RequirePermissions('documents.upload')
  @Post('presign')
  presign(
    @Body() dto: PresignDocumentDto,
    @CurrentUser() user: AuthenticatedUser | null,
  ): Promise<PresignResponse> {
    return this.documentsService.presign(dto, this.requirePrincipal(user));
  }

  @RequirePermissions('documents.upload')
  @Post(':id/confirm')
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmDocumentDto,
    @CurrentUser() user: AuthenticatedUser | null,
  ): Promise<DocumentListItem> {
    return this.documentsService.confirm(id, dto, this.requirePrincipal(user));
  }

  @Get()
  list(
    @Query() query: DocumentQueryDto,
    @CurrentUser() user: AuthenticatedUser | null,
  ): Promise<CollectionResponse<DocumentListItem>> {
    return this.documentsService.list(query, this.requirePrincipal(user));
  }

  @RequirePermissions('documents.download')
  @Get(':id/download')
  download(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser | null,
  ): Promise<DownloadResponse> {
    return this.documentsService.download(id, this.requirePrincipal(user));
  }

  @RequirePermissions('documents.delete')
  @Delete(':id')
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser | null,
  ): Promise<{ deleted: true }> {
    return this.documentsService.delete(id, this.requirePrincipal(user));
  }

  private requirePrincipal(user: AuthenticatedUser | null): AuthenticatedUser {
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Account is not available');
    return user;
  }
}
