import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InvitesService } from './invites.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole, User } from '../users/entities/user.entity';
import { CreateInviteDto } from './dto/create-invite.dto';

@ApiTags('invites')
@Controller('invites')
@ApiBearerAuth()
export class InvitesController {
  constructor(private readonly invitesService: InvitesService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all invites (admin only)' })
  async findAll() {
    return this.invitesService.findAll();
  }

  @Get('pending')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get pending invites' })
  async findPending() {
    return this.invitesService.findPending();
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create new invite' })
  async create(@Body() createInviteDto: CreateInviteDto, @CurrentUser() user: User) {
    return this.invitesService.create(user.id, createInviteDto.role);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete invite' })
  async delete(@Param('id') id: string) {
    await this.invitesService.delete(id);
    return { success: true };
  }
}
