import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import { Chalk } from 'chalk';

dotenv.config();

const chalk = new Chalk({ level: 3 });

const modelsToTest = ['gpt-4.1-nano', 'gpt-4.1-mini', 'gpt-5-mini', 'gpt-5.1'];

const ITERATIONS = 3;
const MIN_LENGTH_OK = 20; // Treat zero/empty results as failure for benchmark purposes

async function runBenchmark() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error(chalk.red('FATAL: OPENAI_API_KEY not found in env.'));
    process.exit(1);
  }

  const baseURL = process.env.OPENAI_BASE_URL; // Optional override (Azure / proxy)
  const client = new OpenAI({ apiKey, baseURL });

  console.log(
    chalk.bold.cyan(
      `\nStarting OpenAI Model Benchmark (${ITERATIONS} runs per model)...\n`,
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
    process.stdout.write(chalk.yellow(`Testing ${modelName.padEnd(20)} `));

    for (let i = 0; i < ITERATIONS; i++) {
      const start = Date.now();
      try {
        const response = await client.chat.completions.create({
          model: modelName,
          messages: [
            { role: 'system', content: 'You are a financial analyst.' },
            {
              role: 'user',
              content:
                'Provide a detailed financial analysis of Apple Inc (AAPL) including latest revenue, margins, and key risks.',
            },
          ],
          max_completion_tokens: 2000,
        });

        // Prefer first choice with content; if none, try tools or function results
        const choice =
          response.choices.find((c) => !!c.message?.content?.length) ||
          response.choices[0];

        let text = choice?.message?.content || '';

        // If the model returned only tool calls / functions, stringify for length
        if (!text && choice?.message?.tool_calls?.length) {
          text = JSON.stringify(choice.message.tool_calls);
        }

        const duration = Date.now() - start;

        if (text.length >= MIN_LENGTH_OK) {
          stats[modelName].success++;
          stats[modelName].totalTime += duration;
          stats[modelName].totalLength += text.length;
          process.stdout.write(chalk.green('✓ '));
        } else {
          // Capture raw response for debugging empty outputs
          stats[modelName].errors.push(
            `Empty/too-short content (len=${text.length}) :: raw=${JSON.stringify(
              response.choices,
            ).slice(0, 500)}`,
          );
          process.stdout.write(chalk.red('✗ '));
        }
      } catch (error: any) {
        stats[modelName].errors.push(error.status || error.message);
        process.stdout.write(chalk.red('✗ '));
      }
    }
    process.stdout.write('\n');
  }

  console.log(chalk.bold.cyan('\nAggregate Results:'));
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
