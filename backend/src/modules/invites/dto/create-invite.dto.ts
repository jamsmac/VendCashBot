import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../users/entities/user.entity';

export class CreateInviteDto {
  @ApiProperty({ enum: [UserRole.OPERATOR, UserRole.MANAGER], description: 'Role for invited user' })
  @IsEnum([UserRole.OPERATOR, UserRole.MANAGER])
  role: UserRole;
}
