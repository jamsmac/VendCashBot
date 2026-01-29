import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
  Req,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { AuthService, TelegramAuthData } from './auth.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TelegramAuthDto } from './dto/telegram-auth.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { User } from '../users/entities/user.entity';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  // Use 'none' for cross-origin cookies (frontend and backend on different domains)
  sameSite: process.env.NODE_ENV === 'production' ? 'none' as const : 'lax' as const,
  path: '/',
};

const ACCESS_TOKEN_MAX_AGE = 15 * 60 * 1000; // 15 minutes
const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Public()
  @Post('telegram')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate via Telegram Login Widget' })
  async telegramAuth(
    @Body() authDto: TelegramAuthDto,
    @Res({ passthrough: true }) res: Response,
  ) {
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
    const { accessToken, refreshToken, user: userData } = await this.authService.login(user);

    // Set httpOnly cookies
    res.cookie('access_token', accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: ACCESS_TOKEN_MAX_AGE,
    });
    res.cookie('refresh_token', refreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: REFRESH_TOKEN_MAX_AGE,
    });

    return { user: userData };
  }

  @Public()
  @Post('dev-login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Development login by role (disabled in production)' })
  async devLogin(
    @Body('role') role: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Block dev-login in production for security
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Dev login is disabled in production');
    }

    // Find a user with the requested role
    const users = await this.authService.findUsersByRole(role);
    if (!users || users.length === 0) {
      throw new UnauthorizedException(`No user found with role ${role}`);
    }

    // Login as the first found user
    const user = users[0];
    const { accessToken, refreshToken, user: userData } = await this.authService.login(user);

    // Set httpOnly cookies
    res.cookie('access_token', accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: ACCESS_TOKEN_MAX_AGE,
    });
    res.cookie('refresh_token', refreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: REFRESH_TOKEN_MAX_AGE,
    });

    return { user: userData };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user' })
  async me(@CurrentUser() user: User): Promise<User> {
    return user;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Get refresh token from cookie or body (backward compatibility)
    const refreshTokenValue = req.cookies?.refresh_token;
    if (!refreshTokenValue) {
      throw new UnauthorizedException('No refresh token provided');
    }

    const { accessToken, refreshToken } = await this.authService.refreshTokens(refreshTokenValue);

    // Set new cookies
    res.cookie('access_token', accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: ACCESS_TOKEN_MAX_AGE,
    });
    res.cookie('refresh_token', refreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: REFRESH_TOKEN_MAX_AGE,
    });

    return { success: true };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout and revoke all refresh tokens' })
  async logout(
    @CurrentUser() user: User,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.revokeAllUserTokens(user.id);

    // Clear cookies
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/' });

    return { success: true };
  }
}
