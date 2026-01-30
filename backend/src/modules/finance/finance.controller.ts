import {
    Controller,
    Get,
    Post,
    Body,
    UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FinanceService } from './finance.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole, User } from '../users/entities/user.entity';
import { CreateDepositDto } from './dto/create-deposit.dto';

@ApiTags('finance')
@Controller('finance')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class FinanceController {
    constructor(private readonly financeService: FinanceService) { }

    @Get('balance')
    @Roles(UserRole.MANAGER, UserRole.ADMIN)
    @ApiOperation({ summary: 'Get current cash balance' })
    async getBalance() {
        return this.financeService.getBalance();
    }

    @Get('deposits')
    @Roles(UserRole.MANAGER, UserRole.ADMIN)
    @ApiOperation({ summary: 'Get deposit history' })
    async getDeposits() {
        return this.financeService.findAllDeposits();
    }

    @Post('deposits')
    @Roles(UserRole.MANAGER, UserRole.ADMIN)
    @ApiOperation({ summary: 'Create new bank deposit' })
    async createDeposit(
        @Body() dto: CreateDepositDto,
        @CurrentUser() user: User,
    ) {
        return this.financeService.createDeposit(user.id, dto);
    }
}
