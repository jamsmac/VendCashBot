import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CollectionsService } from './collections.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole, User } from '../users/entities/user.entity';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { ReceiveCollectionDto } from './dto/receive-collection.dto';
import { EditCollectionDto } from './dto/edit-collection.dto';
import { BulkCreateCollectionDto } from './dto/bulk-create-collection.dto';
import { CollectionQueryDto } from './dto/collection-query.dto';
import { CancelCollectionDto } from './dto/cancel-collection.dto';

@ApiTags('collections')
@Controller('collections')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all collections with filters' })
  async findAll(@Query() query: CollectionQueryDto) {
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
  @ApiOperation({ summary: 'Create collection (from bot)' })
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
}
