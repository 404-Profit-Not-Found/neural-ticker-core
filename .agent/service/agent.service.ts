import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI, type Part, Type, type Tool } from '@google/genai'; 
import * as shell from 'shelljs';
import * as fs from 'fs';
import * as path from 'path';
import yahooFinance from 'yahoo-finance2'; 

type AgentToolArgs = Record<string, any>;
type AgentToolFn = (args: AgentToolArgs) => Promise<string>;

@Injectable()
export class AgentService {
  private client: GoogleGenAI;
  private readonly logger = new Logger(AgentService.name);

  constructor() {
    this.client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  private skillMap: Record<string, AgentToolFn> = {
    run_tests: async ({ testPath }) => {
      this.logger.log(`🧪 Agent running tests: ${testPath}`);
      const cmd = `npx jest ${testPath || ''} --colors=false`;
      const res = shell.exec(cmd, { silent: true });
      return res.code === 0 ? "PASS" : `FAIL:\n${res.stderr}`;
    },

    list_files: async ({ dirPath }) => {
      try {
        const safePath = path.resolve(process.cwd(), dirPath || '.');
        const files = fs.readdirSync(safePath).slice(0, 20);
        return JSON.stringify(files);
      } catch (e: any) { return `Error: ${e.message}`; }
    },

    read_file: async ({ filePath }) => {
       try {
         return fs.readFileSync(filePath, 'utf-8');
       } catch (e: any) { return `Error reading file: ${e.message}`; }
    },

    get_stock_price: async ({ symbol }) => {
      try {
        const quote = await yahooFinance.quote(symbol) as any;
        return JSON.stringify({ symbol: quote.symbol, price: quote.regularMarketPrice });
      } catch (e: any) { return `Error fetching stock: ${e.message}`; }
    }
  };

  private toolsConfig: Tool[] = [
    {
      functionDeclarations: [
        {
          name: 'run_tests',
          description: 'Run Jest tests. Use this to verify code changes.',
          parameters: {
            type: Type.OBJECT,
            properties: { testPath: { type: Type.STRING, description: 'Path to spec file' } },
          },
        },
        {
          name: 'list_files',
          description: 'Check project structure.',
          parameters: {
            type: Type.OBJECT,
            properties: { dirPath: { type: Type.STRING } },
          },
        },
        {
            name: 'read_file',
            description: 'Read code from a file.',
            parameters: {
              type: Type.OBJECT,
              properties: { filePath: { type: Type.STRING } },
              required: ['filePath']
            },
        },
        {
          name: 'get_stock_price',
          description: 'Get real-time stock price.',
          parameters: {
            type: Type.OBJECT,
            properties: { symbol: { type: Type.STRING } },
            required: ['symbol']
          },
        },
      ],
    },
  ];

  async chat(userPrompt: string) {
    const model = 'gemini-2.5-flash-lite'; 
    const chat = this.client.chats.create({
      model: model,
      config: { 
        tools: this.toolsConfig,
        temperature: 0, 
      }, 
    });

    let response = await chat.sendMessage({ message: userPrompt });

    let loops = 0;
    while (response && response.functionCalls && response.functionCalls.length > 0 && loops < 5) {
      loops++;
      const calls = response.functionCalls;
      const parts: Part[] = [];

      for (const call of calls) {
        const fnName = call.name;
        const args = call.args as AgentToolArgs;

        this.logger.log(`🤖 Agent invoking: ${fnName}`);

        let functionResult: string;
        if (fnName && this.skillMap[fnName]) {
            functionResult = await this.skillMap[fnName](args);
        } else {
            functionResult = "Error: Tool not found.";
        }

        parts.push({
          functionResponse: {
            name: fnName,
            response: { result: functionResult },
          },
        });
      }

      response = await chat.sendMessage({ message: parts });
    }

    return response ? response.text : 'No response';
  }
}