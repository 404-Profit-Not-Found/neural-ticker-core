import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserTokenDto {
  @ApiProperty({ example: 'dev@test.com', description: 'Email for dev login' })
  @IsNotEmpty()
  @IsEmail()
  email: string;
}

export class FirebaseLoginDto {
  @ApiProperty({ example: 'firebase_id_token', description: 'Firebase ID Token' })
  @IsNotEmpty()
  @IsString()
  token: string;
}
