import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser, CollectionResponse, ContractListItem } from '@peoplecore/shared';
import { AppError } from '../../common/app-error';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ContractsService } from './contracts.service';
import { ContractQueryDto, CreateContractDto, UpdateContractDto } from './dto/contracts.dto';

@ApiTags('Contracts')
@RequirePermissions('contracts.read')
@Controller('contracts')
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Get()
  list(
    @Query() query: ContractQueryDto,
    @CurrentUser() user: AuthenticatedUser | null,
  ): Promise<CollectionResponse<ContractListItem>> {
    return this.contractsService.list(query, this.requirePrincipal(user));
  }

  @RequirePermissions('contracts.create')
  @Post()
  create(
    @Body() dto: CreateContractDto,
    @CurrentUser() user: AuthenticatedUser | null,
  ): Promise<ContractListItem> {
    return this.contractsService.create(dto, this.requirePrincipal(user));
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser | null,
  ): Promise<ContractListItem> {
    return this.contractsService.findOne(id, this.requirePrincipal(user));
  }

  @RequirePermissions('contracts.update')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContractDto,
    @CurrentUser() user: AuthenticatedUser | null,
  ): Promise<ContractListItem> {
    return this.contractsService.update(id, dto, this.requirePrincipal(user));
  }

  private requirePrincipal(user: AuthenticatedUser | null): AuthenticatedUser {
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Account is not available');
    return user;
  }
}
