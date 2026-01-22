import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { MachinesService } from './machines.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CreateMachineDto } from './dto/create-machine.dto';
import { UpdateMachineDto } from './dto/update-machine.dto';

@ApiTags('machines')
@Controller('machines')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class MachinesController {
  constructor(private readonly machinesService: MachinesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all machines' })
  @ApiQuery({ name: 'active', required: false, type: Boolean })
  @ApiQuery({ name: 'search', required: false, type: String })
  async findAll(
    @Query('active') active?: string,
    @Query('search') search?: string,
  ) {
    if (search) {
      return this.machinesService.search(search);
    }
    return this.machinesService.findAll(active !== 'false');
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

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update machine (admin only)' })
  async update(@Param('id') id: string, @Body() updateMachineDto: UpdateMachineDto) {
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
}
