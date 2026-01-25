import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService, TelegramAuthData } from './auth.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TelegramAuthDto } from './dto/telegram-auth.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

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
  async me(@CurrentUser() user: User): Promise<User> {
    return user;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  async refresh(@Body() body: { refreshToken: string }) {
    return this.authService.refreshTokens(body.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout and revoke all refresh tokens' })
  async logout(@CurrentUser() user: User) {
    await this.authService.revokeAllUserTokens(user.id);
    return { success: true };
  }
}
