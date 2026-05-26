import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const jwtSecret = configService.get<string>('JWT_SECRET');
    if (!jwtSecret) {
      throw new Error(
        'JWT_SECRET is not configured. Refusing to start with a default/empty secret — set JWT_SECRET in the environment.',
      );
    }
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        // NOTE: Intentionally no `fromUrlQueryParameter('token')`.
        // SSE consumers (notifications stream, deep research stream) authenticate
        // via the `authentication` cookie below (EventSource is opened with
        // `withCredentials: true`; the deep-research stream is POST + fetch with
        // `credentials: 'include'`). Putting JWTs in URLs would leak them into
        // access logs, browser history, and Referer headers.
        (req: any) => {
          if (
            req &&
            req.cookies &&
            req.cookies.authentication &&
            req.cookies.authentication.length > 0
          ) {
            return req.cookies.authentication;
          }
          return null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: any) {
    // payload.sub is the user UUID
    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
