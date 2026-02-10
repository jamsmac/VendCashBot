import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, LessThan } from 'typeorm';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { User, UserRole } from '../users/entities/user.entity';
import { Invite } from '../invites/entities/invite.entity';
import { InvitesService } from '../invites/invites.service';
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
    private readonly invitesService: InvitesService,
    private readonly dataSource: DataSource,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
  ) { }

  async findUsersByRole(role: string): Promise<User[]> {
    return this.usersService.findAll(role as UserRole);
  }

  async validateTelegramAuth(authData: TelegramAuthData): Promise<User> {
    // Verify Telegram auth data
    const isValid = this.verifyTelegramAuth(authData);
    if (!isValid) {
      this.logger.warn(`Invalid Telegram auth hash for user ID: ${authData.id}`);
      throw new UnauthorizedException('Invalid Telegram authentication data');
    }

    // Check if auth_date is within valid range
    const authDate = authData.auth_date;
    const now = Math.floor(Date.now() / 1000);
    const ageSeconds = now - authDate;
    // Reject future dates (with 60s tolerance for clock skew)
    if (ageSeconds < -60) {
      this.logger.warn(`Future auth_date for user ID: ${authData.id}, age: ${ageSeconds}s`);
      throw new UnauthorizedException('Invalid authentication data');
    }
    // Reject auth data older than 24 hours
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

    // Use timing-safe comparison to prevent timing attacks
    const calculatedBuffer = Buffer.from(calculatedHash, 'hex');
    const hashBuffer = Buffer.from(hash, 'hex');
    if (calculatedBuffer.length !== hashBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(calculatedBuffer, hashBuffer);
  }

  /**
   * Hash a refresh token for secure storage.
   * We store hashed tokens so a database breach doesn't expose usable tokens.
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Register a new user via Telegram auth + invite code (web panel registration).
   * Entire flow runs in a single transaction with pessimistic locking
   * to prevent TOCTOU race conditions (no orphan users if invite claim fails).
   */
  async registerWithTelegramAndInvite(authData: TelegramAuthData, inviteCode: string): Promise<User> {
    // 1. Verify Telegram auth (stateless — safe outside transaction)
    const isValid = this.verifyTelegramAuth(authData);
    if (!isValid) {
      this.logger.warn(`Invalid Telegram auth hash for registration, user ID: ${authData.id}`);
      throw new UnauthorizedException('Неверные данные авторизации Telegram');
    }

    // 2. Check auth_date freshness (stateless — safe outside transaction)
    const now = Math.floor(Date.now() / 1000);
    if (now - authData.auth_date > 86400) {
      throw new UnauthorizedException('Данные авторизации устарели. Попробуйте ещё раз.');
    }

    // 3. All DB operations in a single transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 3a. Check if user already exists (inside transaction)
      const existingUser = await queryRunner.manager.findOne(User, {
        where: { telegramId: authData.id },
      });
      if (existingUser) {
        throw new BadRequestException('Вы уже зарегистрированы. Используйте кнопку входа.');
      }

      // 3b. Lock and validate invite atomically (pessimistic write lock)
      const invite = await queryRunner.manager.findOne(Invite, {
        where: { code: inviteCode },
        lock: { mode: 'pessimistic_write' },
      });

      if (!invite) {
        throw new BadRequestException('Код приглашения не найден.');
      }
      if (invite.usedById) {
        throw new BadRequestException('Код приглашения уже использован.');
      }
      if (invite.isExpired) {
        throw new BadRequestException('Срок действия приглашения истёк.');
      }

      // 3c. Create user (inside transaction — will be rolled back on failure)
      const name = (authData.first_name || '') + (authData.last_name ? ` ${authData.last_name}` : '');
      const user = queryRunner.manager.create(User, {
        telegramId: authData.id,
        telegramUsername: authData.username,
        telegramFirstName: authData.first_name,
        name: name.trim() || `User ${authData.id}`,
        role: invite.role,
      });
      const savedUser = await queryRunner.manager.save(user);

      // 3d. Claim invite (inside same transaction)
      invite.usedById = savedUser.id;
      invite.usedAt = new Date();
      await queryRunner.manager.save(invite);

      // 4. Commit — both user creation and invite claim succeed atomically
      await queryRunner.commitTransaction();

      this.logger.log(`User registered via web: ${savedUser.id} (${savedUser.name}), role: ${savedUser.role}`);
      return savedUser;
    } catch (error) {
      // Rollback — no orphan users, no partially-claimed invites
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async login(user: User): Promise<{ accessToken: string; refreshToken: string; user: User }> {
    const payload: JwtPayload = {
      sub: user.id,
      telegramId: user.telegramId,
      role: user.role,
    };

    // expiresIn is configured via JwtModule from config (jwt.accessExpiresIn, default '15m')
    const accessToken = this.jwtService.sign(payload);

    // Generate refresh token
    const refreshDays = this.configService.get<number>('jwt.refreshDays') || 30;
    const refreshTokenValue = crypto.randomBytes(64).toString('hex');
    const hashedToken = this.hashToken(refreshTokenValue);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + refreshDays);

    await this.refreshTokenRepository.save({
      token: hashedToken,
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
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Hash the incoming token to match against stored hash
      const hashedToken = this.hashToken(refreshTokenValue);

      // Lock the token row to prevent concurrent refresh with the same token
      const token = await queryRunner.manager.findOne(RefreshToken, {
        where: { token: hashedToken, isRevoked: false },
        lock: { mode: 'pessimistic_write' },
      });

      if (!token) {
        this.logger.warn('Refresh token not found or already revoked');
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      if (token.expiresAt < new Date()) {
        this.logger.warn(`Expired refresh token for user: ${token.userId}`);
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      // Load user relation separately (FOR UPDATE doesn't work with LEFT JOIN)
      const user = await this.usersService.findById(token.userId);

      if (!user?.isActive) {
        this.logger.warn(`Inactive user attempted token refresh: ${token.userId}`);
        throw new UnauthorizedException('User inactive');
      }

      // Revoke old token (rotation) — atomically within the transaction
      token.isRevoked = true;
      await queryRunner.manager.save(token);

      // Generate new tokens
      const payload: JwtPayload = {
        sub: user.id,
        telegramId: user.telegramId,
        role: user.role,
      };
      const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });

      const newRefreshTokenValue = crypto.randomBytes(64).toString('hex');
      const newHashedToken = this.hashToken(newRefreshTokenValue);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      await queryRunner.manager.save(queryRunner.manager.create(RefreshToken, {
        token: newHashedToken,
        userId: user.id,
        expiresAt,
      }));

      await queryRunner.commitTransaction();

      this.logger.log(`Token refreshed for user: ${token.userId}`);
      return { accessToken, refreshToken: newRefreshTokenValue };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
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
