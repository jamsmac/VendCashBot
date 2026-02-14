import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from './entities/user.entity';
import { UpdateUserDto } from './dto/update-user.dto';

@ApiTags('users')
@Controller('users')
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get users with pagination (admin only)' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20, max: 100)' })
  @ApiQuery({ name: 'role', required: false, enum: UserRole })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search by name or telegram username' })
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('role') role?: UserRole,
    @Query('includeInactive') includeInactive?: string,
    @Query('search') search?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page || '1', 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit || '20', 10) || 20));
    return this.usersService.findAllPaginated(
      pageNum,
      limitNum,
      role,
      includeInactive === 'true',
      search,
    );
  }

  @Get('operators')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Get all operators' })
  async getOperators() {
    return this.usersService.getOperators();
  }

  @Get('managers')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all managers and admins' })
  async getManagers() {
    return this.usersService.getManagers();
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get user by ID' })
  async findOne(@Param('id') id: string) {
    return this.usersService.findByIdOrFail(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update user' })
  async update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Deactivate user (soft delete)' })
  async deactivate(@Param('id') id: string) {
    return this.usersService.deactivate(id);
  }

  @Post(':id/activate')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Activate user' })
  async activate(@Param('id') id: string) {
    return this.usersService.activate(id);
  }
}
