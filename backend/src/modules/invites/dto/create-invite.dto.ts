import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../users/entities/user.entity';

export class CreateInviteDto {
  @ApiProperty({ enum: [UserRole.OPERATOR, UserRole.MANAGER], description: 'Role for invited user' })
  @IsIn([UserRole.OPERATOR, UserRole.MANAGER], { message: 'Role must be operator or manager' })
  role: UserRole;
}
