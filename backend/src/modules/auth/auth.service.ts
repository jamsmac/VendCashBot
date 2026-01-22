import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';

export interface TelegramAuthData {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

export interface JwtPayload {
  sub: string;
  telegramId: number;
  role: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async validateTelegramAuth(authData: TelegramAuthData): Promise<User> {
    // Verify Telegram auth data
    const isValid = this.verifyTelegramAuth(authData);
    if (!isValid) {
      throw new UnauthorizedException('Invalid Telegram authentication data');
    }

    // Check if auth_date is not too old (max 24 hours)
    const authDate = authData.auth_date;
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 86400) {
      throw new UnauthorizedException('Telegram authentication data expired');
    }

    // Find user by Telegram ID
    const user = await this.usersService.findByTelegramId(authData.id);
    if (!user) {
      throw new UnauthorizedException('User not registered. Please use an invite link.');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User account is deactivated');
    }

    // Update Telegram data if changed
    if (
      user.telegramUsername !== authData.username ||
      user.telegramFirstName !== authData.first_name
    ) {
      await this.usersService.update(user.id, {
        telegramUsername: authData.username,
        telegramFirstName: authData.first_name,
      });
    }

    return user;
  }

  private verifyTelegramAuth(authData: TelegramAuthData): boolean {
    const botToken = this.configService.get('telegram.botToken');
    if (!botToken) {
      return false;
    }

    const { hash, ...data } = authData;

    // Create data check string
    const dataCheckArr = Object.keys(data)
      .sort()
      .map((key) => `${key}=${data[key as keyof typeof data]}`)
      .join('\n');

    // Create secret key from bot token
    const secretKey = crypto.createHash('sha256').update(botToken).digest();

    // Calculate hash
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckArr)
      .digest('hex');

    return calculatedHash === hash;
  }

  async login(user: User): Promise<{ accessToken: string; user: User }> {
    const payload: JwtPayload = {
      sub: user.id,
      telegramId: user.telegramId,
      role: user.role,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user,
    };
  }

  async validateJwtPayload(payload: JwtPayload): Promise<User | null> {
    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive) {
      return null;
    }
    return user;
  }

  async refreshToken(userId: string): Promise<{ accessToken: string }> {
    const user = await this.usersService.findById(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    const payload: JwtPayload = {
      sub: user.id,
      telegramId: user.telegramId,
      role: user.role,
    };

    return {
      accessToken: this.jwtService.sign(payload),
    };
  }
}
