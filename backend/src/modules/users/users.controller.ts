import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole, User } from './entities/user.entity';
import { UpdateUserDto } from './dto/update-user.dto';
import { ALL_MODULES } from './entities/user-module.entity';

@ApiTags('users')
@Controller('users')
@ApiBearerAuth()
@RequireModule('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all users (admin only)' })
  @ApiQuery({ name: 'role', required: false, enum: UserRole })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  async findAll(
    @Query('role') role?: UserRole,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.usersService.findAll(role, includeInactive === 'true');
  }

  @Get('operators')
  @RequireModule('collections')
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

  @Get(':id/modules')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get user modules (role defaults + custom grants)' })
  async getUserModules(@Param('id') id: string) {
    const modules = await this.usersService.getUserModules(id);
    const customModules = await this.usersService.getCustomModules(id);
    return { modules, customModules, allModules: ALL_MODULES };
  }

  @Put(':id/modules')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Set custom module grants for a user' })
  async setUserModules(
    @Param('id') id: string,
    @Body() body: { modules: string[] },
    @CurrentUser() admin: User,
  ) {
    if (!body.modules || !Array.isArray(body.modules)) {
      throw new BadRequestException('modules must be an array of strings');
    }
    // Validate module names
    const validModules = new Set<string>(ALL_MODULES);
    const invalid = body.modules.filter((m) => !validModules.has(m));
    if (invalid.length > 0) {
      throw new BadRequestException(`Invalid modules: ${invalid.join(', ')}`);
    }
    const modules = await this.usersService.setUserModules(id, body.modules, admin.id);
    return { modules };
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update user' })
  async update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    // BE-L03: Reject empty update body
    const hasFields = ['name', 'telegramUsername', 'telegramFirstName', 'phone', 'isActive']
      .some(key => (updateUserDto as Record<string, unknown>)[key] !== undefined);
    if (!hasFields) {
      throw new BadRequestException('At least one field must be provided for update');
    }
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
