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
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { MachinesService } from './machines.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole, User } from '../users/entities/user.entity';
import { CreateMachineDto } from './dto/create-machine.dto';
import { UpdateMachineDto } from './dto/update-machine.dto';
import { RejectMachineDto } from './dto/reject-machine.dto';
import {
  CreateMachineLocationDto,
  UpdateMachineLocationDto,
} from './dto/machine-location.dto';

@ApiTags('machines')
@Controller('machines')
@ApiBearerAuth()
@RequireModule('machines')
export class MachinesController {
  constructor(private readonly machinesService: MachinesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all machines' })
  @ApiQuery({ name: 'active', required: false, type: Boolean })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'approved', required: false, type: Boolean })
  async findAll(
    @Query('active') active?: string,
    @Query('search') search?: string,
    @Query('approved') approved?: string,
  ) {
    if (search) {
      return this.machinesService.search(search, approved === 'false');
    }
    return this.machinesService.findAll(
      active !== 'false',
      approved !== 'false',
    );
  }

  @Get('pending')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get pending machines (admin only)' })
  async getPending() {
    return this.machinesService.findPending();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get machine by ID' })
  async findOne(@Param('id') id: string) {
    return this.machinesService.findByIdOrFail(id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create machine (admin only)' })
  async create(@Body() createMachineDto: CreateMachineDto) {
    return this.machinesService.create(createMachineDto);
  }

  @Post('request')
  @Roles(UserRole.OPERATOR, UserRole.MANAGER)
  @ApiOperation({ summary: 'Request new machine (creates pending machine)' })
  async requestMachine(
    @Body() createMachineDto: CreateMachineDto,
    @CurrentUser() user: User,
  ) {
    return this.machinesService.createByOperator(createMachineDto, user.id);
  }

  @Post(':id/approve')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Approve machine (admin only)' })
  async approve(@Param('id') id: string, @CurrentUser() user: User) {
    return this.machinesService.approve(id, user.id);
  }

  @Post(':id/reject')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Reject machine (admin only)' })
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectMachineDto,
    @CurrentUser() user: User,
  ) {
    return this.machinesService.reject(id, user.id, dto.reason);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update machine (admin only)' })
  async update(
    @Param('id') id: string,
    @Body() updateMachineDto: UpdateMachineDto,
  ) {
    return this.machinesService.update(id, updateMachineDto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Deactivate machine (admin only)' })
  async deactivate(@Param('id') id: string) {
    return this.machinesService.deactivate(id);
  }

  @Post(':id/activate')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Activate machine (admin only)' })
  async activate(@Param('id') id: string) {
    return this.machinesService.activate(id);
  }

  // ========== Machine Locations ==========

  @Get(':id/locations')
  @ApiOperation({ summary: 'Get all locations for a machine' })
  async getLocations(@Param('id') id: string) {
    return this.machinesService.getLocations(id);
  }

  @Get(':id/locations/current')
  @ApiOperation({ summary: 'Get current location for a machine' })
  async getCurrentLocation(@Param('id') id: string) {
    return this.machinesService.getCurrentLocation(id);
  }

  @Get(':id/locations/for-date')
  @ApiQuery({ name: 'date', required: true, type: String })
  @ApiOperation({ summary: 'Get location for a specific date' })
  async getLocationForDate(
    @Param('id') id: string,
    @Query('date') date: string,
  ) {
    return this.machinesService.getLocationForDate(id, new Date(date));
  }

  @Post(':id/locations')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Add a new location to machine' })
  async addLocation(
    @Param('id') id: string,
    @Body() dto: CreateMachineLocationDto,
  ) {
    return this.machinesService.addLocation(id, dto);
  }

  @Patch('locations/:locationId')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Update a machine location' })
  async updateLocation(
    @Param('locationId') locationId: string,
    @Body() dto: UpdateMachineLocationDto,
  ) {
    return this.machinesService.updateLocation(locationId, dto);
  }

  @Delete('locations/:locationId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete a machine location (admin only)' })
  async deleteLocation(@Param('locationId') locationId: string) {
    return this.machinesService.deleteLocation(locationId);
  }

  @Post('locations/:locationId/set-current')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Set location as current' })
  async setCurrentLocation(@Param('locationId') locationId: string) {
    return this.machinesService.setCurrentLocation(locationId);
  }
}
