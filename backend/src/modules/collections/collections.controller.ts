import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CollectionsService } from './collections.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole, User } from '../users/entities/user.entity';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { ReceiveCollectionDto } from './dto/receive-collection.dto';
import { EditCollectionDto } from './dto/edit-collection.dto';
import { BulkCreateCollectionDto } from './dto/bulk-create-collection.dto';
import { CollectionQueryDto } from './dto/collection-query.dto';
import { CancelCollectionDto } from './dto/cancel-collection.dto';
import { BulkCancelCollectionDto } from './dto/bulk-cancel-collection.dto';

@ApiTags('collections')
@Controller('collections')
@ApiBearerAuth()
@RequireModule('collections')
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all collections with filters' })
  async findAll(@Query() query: CollectionQueryDto, @CurrentUser() user: User) {
    // IDOR protection: operators can only see their own collections
    if (user.role === UserRole.OPERATOR) {
      query.operatorId = user.id;
    }
    return this.collectionsService.findAll(query);
  }

  @Get('pending')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get pending collections' })
  async findPending() {
    return this.collectionsService.findPending();
  }

  @Get('my')
  @ApiOperation({ summary: 'Get current user collections' })
  async findMy(@CurrentUser() user: User, @Query('date') date?: string) {
    const dateObj = date ? new Date(date) : new Date();
    return this.collectionsService.findByOperator(user.id, dateObj);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get collection by ID' })
  async findOne(@Param('id') id: string, @CurrentUser() user: User) {
    const collection = await this.collectionsService.findByIdOrFail(id);

    // IDOR protection: operators can only view their own collections
    if (user.role === UserRole.OPERATOR && collection.operatorId !== user.id) {
      throw new ForbiddenException('You can only view your own collections');
    }

    return collection;
  }

  @Get(':id/history')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get collection change history' })
  async getHistory(@Param('id') id: string) {
    return this.collectionsService.getHistory(id);
  }

  @Post()
  @Roles(UserRole.OPERATOR)
  @ApiOperation({ summary: 'Create collection (from bot, operator only)' })
  async create(@Body() dto: CreateCollectionDto, @CurrentUser() user: User) {
    return this.collectionsService.create(dto, user.id);
  }

  @Post('bulk')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Bulk create collections (historical data)' })
  async bulkCreate(@Body() dto: BulkCreateCollectionDto, @CurrentUser() user: User) {
    return this.collectionsService.bulkCreate(dto, user.id);
  }

  @Patch(':id/receive')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Receive collection' })
  async receive(
    @Param('id') id: string,
    @Body() dto: ReceiveCollectionDto,
    @CurrentUser() user: User,
  ) {
    return this.collectionsService.receive(id, user.id, dto);
  }

  @Patch('bulk-cancel')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Bulk cancel collections by IDs or filters' })
  async bulkCancel(
    @Body() dto: BulkCancelCollectionDto,
    @CurrentUser() user: User,
  ) {
    return this.collectionsService.bulkCancel(dto, user.id);
  }

  @Patch(':id/edit')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Edit received collection' })
  async edit(
    @Param('id') id: string,
    @Body() dto: EditCollectionDto,
    @CurrentUser() user: User,
  ) {
    return this.collectionsService.edit(id, user.id, dto);
  }

  @Patch(':id/cancel')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Cancel collection' })
  async cancel(
    @Param('id') id: string,
    @Body() dto: CancelCollectionDto,
    @CurrentUser() user: User,
  ) {
    return this.collectionsService.cancel(id, user.id, dto.reason);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete collection (admin only)' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    return this.collectionsService.remove(id, user.id);
  }
}
