import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai'; // Old SDK
// SWITCHING TO YOUR NEW SDK:
import { genai, type Client } from '@google/genai'; 
import * as shell from 'shelljs';
import * as fs from 'fs';
import * as path from 'path';
import yahooFinance from 'yahoo-finance2'; // leveraging your installed lib

@Injectable()
export class AgentService {
  private client: Client;
  private readonly logger = new Logger(AgentService.name);

  constructor() {
    // Initialize the NEW Unified SDK
    this.client = new genai.Client({ apiKey: process.env.GEMINI_API_KEY });
  }

  // --- 1. THE SKILLS REGISTRY ---
  // We map the Tool Name (string) to the Actual Function
  private skillMap = {
    // TDD Skill
    run_tests: async ({ testPath }) => {
      this.logger.log(`🧪 Agent running tests: ${testPath}`);
      // Using your 'jest' dependency
      const cmd = `npx jest ${testPath || ''} --colors=false`;
      const res = shell.exec(cmd, { silent: true });
      return res.code === 0 ? "PASS" : `FAIL:\n${res.stderr}`;
    },

    // Architect Skill
    list_files: async ({ dirPath }) => {
      try {
        const safePath = path.resolve(process.cwd(), dirPath || '.');
        const files = fs.readdirSync(safePath).slice(0, 20); // Limit to 20 to save tokens
        return JSON.stringify(files);
      } catch (e) { return `Error: ${e.message}`; }
    },

    read_file: async ({ filePath }) => {
       try {
         return fs.readFileSync(filePath, 'utf-8');
       } catch (e) { return `Error reading file: ${e.message}`; }
    },

    // Market Analyst Skill (Bonus: You have yahoo-finance2!)
    get_stock_price: async ({ symbol }) => {
      try {
        const quote = await yahooFinance.quote(symbol);
        return JSON.stringify({ symbol: quote.symbol, price: quote.regularMarketPrice });
      } catch (e) { return `Error fetching stock: ${e.message}`; }
    }
  };

  // --- 2. TOOL DEFINITIONS (What the LLM sees) ---
  private toolsConfig = [
    {
      functionDeclarations: [
        {
          name: 'run_tests',
          description: 'Run Jest tests. Use this to verify code changes.',
          parameters: {
            type: 'OBJECT',
            properties: { testPath: { type: 'STRING', description: 'Path to spec file' } },
          },
        },
        {
          name: 'list_files',
          description: 'Check project structure.',
          parameters: {
            type: 'OBJECT',
            properties: { dirPath: { type: 'STRING' } },
          },
        },
        {
            name: 'read_file',
            description: 'Read code from a file.',
            parameters: {
              type: 'OBJECT',
              properties: { filePath: { type: 'STRING' } },
              required: ['filePath']
            },
        },
        {
          name: 'get_stock_price',
          description: 'Get real-time stock price.',
          parameters: {
            type: 'OBJECT',
            properties: { symbol: { type: 'STRING' } },
            required: ['symbol']
          },
        },
      ],
    },
  ];

  // --- 3. THE SMART LOOP ---
  async chat(userPrompt: string) {
    const model = 'gemini-2.5-flash-lite'; 
    const chat = this.client.chats.create({
      model: model,
      config: { 
        tools: this.toolsConfig,
        temperature: 0, // Zero temp for coding accuracy
      }, 
    });

    // 1. Send User Prompt
    let result = await chat.sendMessage(userPrompt);
    let response = result.response;

    // 2. The Loop: While the model wants to call functions...
    let loops = 0;
    while (response.functionCalls() && response.functionCalls().length > 0 && loops < 5) {
      loops++;
      const calls = response.functionCalls();
      const parts = [];

      for (const call of calls) {
        const fnName = call.name;
        const args = call.args;

        this.logger.log(`🤖 Agent invoking: ${fnName}`);

        // Execute the TypeScript function
        let functionResult;
        if (this.skillMap[fnName]) {
            functionResult = await this.skillMap[fnName](args);
        } else {
            functionResult = "Error: Tool not found.";
        }

        // Prepare response for the model
        parts.push({
          functionResponse: {
            name: fnName,
            response: { result: functionResult },
          },
        });
      }

      // 3. Send Tool Outputs back to Gemini
      result = await chat.sendMessage(parts);
      response = result.response;
    }

    // 4. Final Natural Language Answer
    return response.text();
  }
}