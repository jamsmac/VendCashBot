import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService, TelegramAuthData } from './auth.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TelegramAuthDto } from './dto/telegram-auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('telegram')
  @ApiOperation({ summary: 'Authenticate via Telegram Login Widget' })
  async telegramAuth(@Body() authDto: TelegramAuthDto) {
    const authData: TelegramAuthData = {
      id: authDto.id,
      first_name: authDto.first_name,
      last_name: authDto.last_name,
      username: authDto.username,
      photo_url: authDto.photo_url,
      auth_date: authDto.auth_date,
      hash: authDto.hash,
    };

    const user = await this.authService.validateTelegramAuth(authData);
    return this.authService.login(user);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user' })
  async me(@Request() req: any) {
    return req.user;
  }

  @Post('refresh')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Refresh access token' })
  async refresh(@Request() req: any) {
    return this.authService.refreshToken(req.user.id);
  }
}
