import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { CreditService } from '../../users/credit.service';
import { UsersService } from '../../users/users.service';

@Injectable()
export class CreditGuard implements CanActivate {
  constructor(
    private readonly creditService: CreditService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Determine cost based on model
    const body = request.body;
    const model = body?.model;
    const cost = this.creditService.getModelCost(model);

    // Fetch fresh user to check tier/balance
    const freshUser = await this.usersService.findById(user.id);
    if (!freshUser) throw new ForbiddenException('User not found');

    if (cost > 1 && freshUser.tier === 'free') {
      throw new ForbiddenException('Pro models require a Pro subscription.');
    }

    // Check balance ONLY - Deduction moved to Controller
    if (freshUser.role === 'admin') {
      // Admins bypass check
      return true;
    }

    const balance = freshUser.credits_balance ?? 0;
    if (balance < cost) {
      throw new ForbiddenException(
        `Insufficient credits. You need ${cost} but have ${balance}.`,
      );
    }

    return true;
  }
}
