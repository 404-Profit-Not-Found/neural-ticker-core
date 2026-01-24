import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { AgentService } from './agent.service';

@Controller('agent') // This maps to /agent
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post('chat') // This maps to /agent/chat
  async chat(@Body() body: { message: string }) {
    if (!body.message) {
      throw new HttpException('Message is required', HttpStatus.BAD_REQUEST);
    }
    
    // Pass the user's message to the "Brain"
    const response = await this.agentService.chat(body.message);
    
    return { 
      success: true,
      reply: response 
    };
  }
}