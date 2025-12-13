import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';
import { Chalk } from 'chalk';

dotenv.config();

const chalk = new Chalk({ level: 3 });

const modelsToTest = [
  'gemini-2.5-flash',
  'gemini-2.0-flash-exp',
  'gemini-2.0-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash-lite',
  'gemini-2.5-pro',
  'gemini-3-pro',
  'gemini-1.5-pro-002',
  'deep-research-pro-preview',
];

const ITERATIONS = 3;

async function runBenchmark() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error(chalk.red('FATAL: GEMINI_API_KEY not found in env.'));
    process.exit(1);
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  console.log(
    chalk.bold.cyan(
      `\nStarting Gemini Model Benchmark (${ITERATIONS} runs per model)...\n`,
    ),
  );

  const stats: Record<
    string,
    {
      success: number;
      totalTime: number;
      totalLength: number;
      errors: string[];
    }
  > = {};

  for (const modelName of modelsToTest) {
    stats[modelName] = { success: 0, totalTime: 0, totalLength: 0, errors: [] };
    process.stdout.write(chalk.yellow(`Testing ${modelName.padEnd(30)} `));

    for (let i = 0; i < ITERATIONS; i++) {
      const start = Date.now();
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: 'Provide a detailed financial analysis of Apple Inc (AAPL) including latest revenue, margins, and key risks.',
                },
              ],
            },
          ],
          generationConfig: { maxOutputTokens: 2000 },
        });
        const text = result.response.text();
        const duration = Date.now() - start;

        stats[modelName].success++;
        stats[modelName].totalTime += duration;
        stats[modelName].totalLength += text.length;
        process.stdout.write(chalk.green('✓ '));
      } catch (error: any) {
        stats[modelName].errors.push(error.status || error.message);
        process.stdout.write(chalk.red('✗ '));
      }
    }
    process.stdout.write('\n');
  }

  console.log(chalk.bold.cyan('\nAggergate Results:'));
  const tableData = modelsToTest.map((model) => {
    const s = stats[model];
    const avgTime = s.success > 0 ? (s.totalTime / s.success).toFixed(0) : '-';
    const avgLen = s.success > 0 ? (s.totalLength / s.success).toFixed(0) : '-';
    return {
      Model: model,
      Success: `${s.success}/${ITERATIONS}`,
      'Avg Time (ms)': avgTime,
      'Avg Length': avgLen,
      Errors: s.errors.length > 0 ? s.errors[0] : '',
    };
  });
  console.table(tableData);
}

runBenchmark().catch((err) => {
  console.error(chalk.red('Benchmark failed:'), err);
  process.exit(1);
});
