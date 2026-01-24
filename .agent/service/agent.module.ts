import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';

@Module({
  controllers: [AgentController], // Registers the endpoint /agent/chat
  providers: [AgentService],      // Registers the logic
  exports: [AgentService],        // Allows other modules to use the agent
})
export class AgentModule {}