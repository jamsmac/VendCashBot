import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';

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
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
  ) { }

  async findUsersByRole(role: string): Promise<User[]> {
    return this.usersService.findAll(role as any);
  }

  async validateTelegramAuth(authData: TelegramAuthData): Promise<User> {
    // Verify Telegram auth data
    const isValid = this.verifyTelegramAuth(authData);
    if (!isValid) {
      this.logger.warn(`Invalid Telegram auth hash for user ID: ${authData.id}`);
      throw new UnauthorizedException('Invalid Telegram authentication data');
    }

    // Check if auth_date is not too old (max 24 hours)
    const authDate = authData.auth_date;
    const now = Math.floor(Date.now() / 1000);
    const ageSeconds = now - authDate;
    if (ageSeconds > 86400) {
      this.logger.warn(`Expired Telegram auth for user ID: ${authData.id}, age: ${ageSeconds}s`);
      throw new UnauthorizedException('Telegram authentication data expired');
    }

    // Find user by Telegram ID
    const user = await this.usersService.findByTelegramId(authData.id);
    if (!user) {
      this.logger.warn(`Unregistered user attempted login: Telegram ID ${authData.id}`);
      throw new UnauthorizedException('User not registered. Please use an invite link.');
    }

    if (!user.isActive) {
      this.logger.warn(`Deactivated user attempted login: ${user.id}`);
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
      this.logger.log(`Updated Telegram data for user: ${user.id}`);
    }

    this.logger.log(`User authenticated: ${user.id} (${user.name})`);
    return user;
  }

  private verifyTelegramAuth(authData: TelegramAuthData): boolean {
    const botToken = this.configService.get('telegram.botToken');
    if (!botToken) {
      this.logger.error('No bot token configured');
      return false;
    }

    const { hash, ...data } = authData;

    // Create data check string - IMPORTANT: filter out undefined/null values
    const dataCheckArr = Object.keys(data)
      .filter((key) => data[key as keyof typeof data] !== undefined && data[key as keyof typeof data] !== null)
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

  async login(user: User): Promise<{ accessToken: string; refreshToken: string; user: User }> {
    const payload: JwtPayload = {
      sub: user.id,
      telegramId: user.telegramId,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });

    // Generate refresh token
    const refreshTokenValue = crypto.randomBytes(64).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days expiry

    await this.refreshTokenRepository.save({
      token: refreshTokenValue,
      userId: user.id,
      expiresAt,
    });

    return {
      accessToken,
      refreshToken: refreshTokenValue,
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

  async refreshTokens(refreshTokenValue: string): Promise<{ accessToken: string; refreshToken: string }> {
    const token = await this.refreshTokenRepository.findOne({
      where: { token: refreshTokenValue, isRevoked: false },
      relations: ['user'],
    });

    if (!token) {
      this.logger.warn('Refresh token not found or already revoked');
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (token.expiresAt < new Date()) {
      this.logger.warn(`Expired refresh token for user: ${token.userId}`);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (!token.user?.isActive) {
      this.logger.warn(`Inactive user attempted token refresh: ${token.userId}`);
      throw new UnauthorizedException('User inactive');
    }

    // Revoke old token (rotation)
    token.isRevoked = true;
    await this.refreshTokenRepository.save(token);

    // Issue new tokens
    const { accessToken, refreshToken } = await this.login(token.user);
    this.logger.log(`Token refreshed for user: ${token.userId}`);
    return { accessToken, refreshToken };
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    await this.refreshTokenRepository.update(
      { userId, isRevoked: false },
      { isRevoked: true },
    );
  }

  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.refreshTokenRepository.delete({
      expiresAt: LessThan(new Date()),
    });
    return result.affected || 0;
  }
}
