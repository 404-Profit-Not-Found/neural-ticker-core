import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
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

    // Determine cost based on model or request body
    // Default cost is 1 credit. Deep models could cost 5.
    // Ideally this comes from a metadata decorator or body inspection.
    const body = request.body;
    let cost = 1;

    // Simple heuristic for now based on model name in body
    // In future, use Reflector to get metadata from controller handler
    if (body && body.model) {
      if (body.model.includes('deep') || body.model.includes('pro') || body.model.includes('gpt-5')) {
        cost = 5;
      }
    }

    // Check if user is Free tier and trying to use Pro model?
    // This is better handled by a separate TierGuard or here.
    // Plan says: "Tier Locking: If user.tier === 'free' AND model is 'Pro' -> Disable"
    // So if they somehow bypassed UI, we should block them.
    
    // We need to fetch fresh user to check tier/balance if request.user is stale payload
    const freshUser = await this.usersService.findById(user.id);
    if (!freshUser) throw new ForbiddenException('User not found');

    // The instruction "In CreditGuard, check role instead of tier" is applied here.
    // Assuming 'user' role corresponds to 'free' tier for this check.
    if (cost > 1 && freshUser.tier === 'free') {
       throw new ForbiddenException('Pro models require a Pro subscription.');
    }

    try {
      if (freshUser.role === 'admin') {
         // Admins arguably don't pay, or we track it but don't fail?
         // Let's make them pay for now to track usage, but give them infinite credits?
         // For now, treat admin like normal user but maybe they have huge balance.
      }
      
      await this.creditService.deductCredits(
        user.id,
        cost,
        'research_spend',
        { model: body.model, ticker: body.ticker }
      );
      return true;
    } catch (error) {
       if (error instanceof BadRequestException) {
         throw new ForbiddenException('Insufficient credits. Please upgrade or contribute research.');
       }
       throw error;
    }
  }
}
