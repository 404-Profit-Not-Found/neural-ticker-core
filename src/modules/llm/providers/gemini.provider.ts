import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GoogleGenAI,
  Tool,
  ThinkingConfig,
  GenerateContentConfig,
} from '@google/genai'; // NEW SDK
import { ILlmProvider, ResearchPrompt, ResearchResult } from '../llm.types';
import { LlmBudgetService } from '../llm-budget.service';
import { GEMINI_FLASH_LITE_MODEL } from '../../../config/configuration';
import { LlmUnavailableException } from '../llm-unavailable.exception';

@Injectable()
export class GeminiProvider implements ILlmProvider {
  private readonly logger = new Logger(GeminiProvider.name);
  private client: GoogleGenAI;

  private readonly defaultModels = {
    deep: 'gemini-3.1-pro-preview',
    medium: 'gemini-3.8-flash',
    low: GEMINI_FLASH_LITE_MODEL,
    extraction: GEMINI_FLASH_LITE_MODEL,
    cron: GEMINI_FLASH_LITE_MODEL,
    // Local text tasks (summarize / score / recommend over text already in the
    // prompt — no web search). These USED to run on Gemma 4, but on the paid
    // (Tier 2) key Gemma has the LOWEST limits of any model — 16K TPM / 30 RPM —
    // and a small context window, so large research notes 429'd it constantly
    // and blew the TPM cap ~8x in a single call. flash-lite has ~625x the TPM
    // (10M), a 1M-token context, and is among the cheapest models, so it's a
    // strictly better fit. Like every Flash Lite default here they follow
    // GEMINI_FLASH_LITE_MODEL (src/config/configuration.ts); these three are
    // not env-tunable. Gemma is no longer the default for any tier.
    summary: GEMINI_FLASH_LITE_MODEL,
    recommendation: GEMINI_FLASH_LITE_MODEL,
    scoring: GEMINI_FLASH_LITE_MODEL,
  };

  // Gemma models don't support Google Search grounding or thinking. No tier
  // defaults to Gemma anymore (see defaultModels), but this set still routes any
  // gemma-* id — set via the still-tunable tiers (e.g. GEMINI_MODEL_MEDIUM) or
  // by editing a hardcoded literal — to the correct no-search / no-thinking config.
  private readonly gemmaModels = new Set([
    'gemma-4-26b-a4b-it',
    'gemma-4-31b-it',
  ]);

  constructor(
    private readonly configService: ConfigService,
    private readonly budgetService: LlmBudgetService,
  ) {
    const apiKey = this.configService.get<string>('gemini.apiKey');
    if (apiKey) {
      this.client = new GoogleGenAI({ apiKey });
    }
  }

  async generate(prompt: ResearchPrompt): Promise<ResearchResult> {
    const apiKey =
      prompt.apiKey || this.configService.get<string>('gemini.apiKey');
    // Not a bug: nothing is configured to answer. A stable 503, not a 500.
    if (!apiKey) throw new LlmUnavailableException('not_configured');

    const client = prompt.apiKey ? new GoogleGenAI({ apiKey }) : this.client;

    const modelName = this.resolveModel(prompt.quality);
    const isGemma = this.gemmaModels.has(modelName);
    const isThinkingModel =
      !isGemma && (modelName.includes('thinking') || modelName.includes('pro'));

    // 1. Configure Tools (Google Search)
    // Extraction is a pure JSON-from-text task; grounding adds latency
    // and is rate-limited harder on flash-lite tiers (returns 429 even with
    // budget left for the model itself).
    const isExtraction = prompt.quality === 'extraction';
    // Local text tasks operate purely on text already present in the prompt
    // (grade a note / summarize fetched news / recommend from a portfolio list).
    // They must NOT trigger web search — it adds latency and cost and burns the
    // grounding quota for no benefit.
    const isLocalTextTask =
      prompt.quality === 'summary' ||
      prompt.quality === 'scoring' ||
      prompt.quality === 'recommendation';
    const noSearch = isExtraction || isGemma || isLocalTextTask;
    const tools: Tool[] = noSearch ? [] : [{ googleSearch: {} }];

    let thinkingConfig: ThinkingConfig | undefined;
    if (isThinkingModel) {
      thinkingConfig = {
        includeThoughts: true,
        thinkingBudget: modelName.includes('pro') ? 4096 : 2048,
      };
    }

    const systemInstruction = isExtraction
      ? `You are a strict data extraction engine. Read the provided text and output ONLY the requested JSON. Do not search the web. Do not invent fields. Use null for anything not explicitly stated in the text.`
      : isGemma || isLocalTextTask
        ? `You are a concise financial analyst. Answer using only the provided context — do not search the web and do not invent facts.
      Context: ${JSON.stringify(prompt.numericContext)}`
        : `You are a financial analyst performing deep research.
      CRITICAL INSTRUCTION: You have access to a "Google Search" tool. You MUST use it to find the latest news, earnings reports, and market sentiment for the requested tickers. Do not rely solely on your internal knowledge. Gather all available information and resources including news, filings, and press releases, fundamentals, and market data.
      Context: ${JSON.stringify(prompt.numericContext)}`;

    const config: GenerateContentConfig = {
      tools: tools.length ? tools : undefined,
      thinkingConfig: thinkingConfig,
      systemInstruction,
    };

    // Retry & Fallback Logic
    let attempts = 0;
    const maxAttempts = 3;
    let currentModel = modelName;

    // Branch for Deep Research Agent (Interactions API)
    if (currentModel === 'deep-research-pro-preview-12-2025') {
      try {
        this.logger.log(`Executing Deep Research Agent: ${currentModel}`);
        // Cast to any for v1beta interactions support
        const interactionStream = await (client as any).interactions.create({
          agent: currentModel,
          input: prompt.question,
          background: true,
          stream: true,
          agent_config: { thinking_summaries: 'auto' },
        });

        let fullText = '';
        const collectedThoughts: string[] = [];
        let collectedSources: any[] = [];

        for await (const chunk of interactionStream) {
          // 1. Thoughts
          if (
            chunk.delta?.type === 'thought_summary' ||
            chunk.delta?.part?.thought
          ) {
            const t = chunk.delta.text || chunk.delta.part?.thought;
            if (t) collectedThoughts.push(t);
          }
          // 2. Sources
          if (chunk.groundingMetadata?.groundingChunks) {
            collectedSources = collectedSources.concat(
              chunk.groundingMetadata.groundingChunks,
            );
          }
          // 3. Content
          if (chunk.delta?.type === 'text' || chunk.delta?.text) {
            fullText += chunk.delta.text || '';
          }
        }

        return {
          provider: 'gemini',
          models: [currentModel],
          answerMarkdown: fullText,
          groundingMetadata: { groundingChunks: collectedSources },
          thoughts: JSON.stringify(collectedThoughts),
          tokensIn: 0, // Not provided in stream easily
          tokensOut: 0,
        };
      } catch (err: any) {
        // If interaction fails, we might want to fall back or throw.
        // Given user strictness, we throw specific error.
        this.logger.error(`Deep Research Interaction Failed: ${err.message}`);
        throw err;
      }
    }

    const secondaryApiKey = this.configService.get<string>(
      'gemini.secondaryApiKey',
    );
    // Cron / background research must stay on the free key: never escalate to
    // the billed secondary key on a 429.
    const freeOnly = prompt.freeOnly === true || prompt.quality === 'cron';
    let hasSwitchedToSecondary = false;
    let activeApiKey = apiKey;
    let activeClient = client;
    currentModel = modelName;

    // Models available on the Primary (Free) Key. These run on the free quota
    // and MUST be metered against the daily budget. Keep in sync with the
    // free-tier entries of `defaultModels` (e.g. `medium: gemini-3.8-flash`,
    // `low: gemini-3.5-flash-lite`). 3.5-flash stays listed so a
    // GEMINI_MODEL_MEDIUM override back to it is still metered, and
    // 3.1-flash-lite (the background default until it moved to 3.5) so an
    // override back to it — and its place as a free fallback on a 429 (see
    // freeFallbackOrder below) — keeps working. Gemini 3.x only — the legacy 2.5-flash / 2.5-flash-lite
    // fallbacks were removed so the app never silently degrades to an older
    // model on a 429.
    const freeModels = [
      'gemini-3.8-flash',
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
    ];

    // Order in which a 429 moves a call to another free model. A Flash Lite
    // call tries the other Flash Lite first: every model has its own free
    // quota at Google (500 requests a day for each Flash Lite), so that is a
    // like-for-like move, and it leaves the Flash models' free quota to the
    // `medium` tier that asks for them. Any other call keeps the list order.
    const isFlashLite = (m: string) => m.includes('flash-lite');
    const freeFallbackOrder = isFlashLite(modelName)
      ? [
          ...freeModels.filter(isFlashLite),
          ...freeModels.filter((m) => !isFlashLite(m)),
        ]
      : freeModels;

    const triedOnCurrentKey = new Set<string>();

    // CRITICAL: gemini-3 preview models are gated behind the Secondary (Billed) Key for stability/quota
    const isGatedPreviewModel =
      currentModel.startsWith('gemini-3') && currentModel.endsWith('-preview');
    if (isGatedPreviewModel && freeOnly) {
      // A free-only call never uses the billed key — not even for a model that
      // only the billed key serves. It stays on the free key and fails there.
      this.logger.warn(
        `${currentModel} needs the billed key, but this call is free-only. Staying on the Primary key.`,
      );
    } else if (
      isGatedPreviewModel &&
      !hasSwitchedToSecondary &&
      secondaryApiKey
    ) {
      this.logger.warn(
        `${currentModel} is restricted on Free Key. Switching to SECONDARY API KEY immediately.`,
      );
      activeApiKey = secondaryApiKey;
      activeClient = new GoogleGenAI({ apiKey: activeApiKey });
      hasSwitchedToSecondary = true;
    }

    // Standard GenerateContent Flow
    while (attempts < maxAttempts * 6) {
      // Increased buffer for multiple tiers and keys
      try {
        attempts++;
        triedOnCurrentKey.add(currentModel);

        this.logger.log(
          `Gemini Request [Attempt ${attempts}] using ${currentModel} (Key: ${hasSwitchedToSecondary ? 'Secondary' : 'Primary'})`,
        );

        const result = await activeClient.models.generateContent({
          model: currentModel,
          contents: [{ role: 'user', parts: [{ text: prompt.question }] }],
          config: config,
        });

        // 3. Extract Grounding Metadata
        const groundingMeta = result.candidates?.[0]?.groundingMetadata;

        // 4. Extract Thoughts
        const thoughts = result.candidates?.[0]?.content?.parts?.filter(
          (p) => p.thought,
        );

        // Count successful free-tier (primary key) flash-lite calls against
        // the hard daily budget. Billed secondary calls are excluded. Local
        // text tasks (summary/scoring/recommendation) are also excluded: they
        // historically ran on Gemma's separate quota and were never metered, and
        // even now that they run on flash-lite the daily budget should keep
        // gating *research* throughput only — otherwise per-ticket scoring +
        // title generation would roughly halve the tickets the cron can process
        // before hitting the cap.
        if (
          !hasSwitchedToSecondary &&
          !isLocalTextTask &&
          freeModels.includes(currentModel)
        ) {
          await this.budgetService.record(1);
        }

        return {
          provider: 'gemini',
          models: [currentModel],
          answerMarkdown: result.text || '',
          groundingMetadata: groundingMeta,
          thoughts: thoughts ? JSON.stringify(thoughts) : undefined,
          tokensIn: result.usageMetadata?.promptTokenCount ?? 0,
          tokensOut: result.usageMetadata?.candidatesTokenCount ?? 0,
        };
      } catch (err: any) {
        const isQuotaError =
          err.status === 429 ||
          err.code === 429 ||
          err.message?.includes('429') ||
          err.message?.includes('quota');

        if (isQuotaError && attempts < maxAttempts * 6) {
          // 1. Try to find another FREE model on the CURRENT key
          const nextFreeModel = freeFallbackOrder.find(
            (m) => !triedOnCurrentKey.has(m),
          );
          // Gating check for next model in chain
          const isNextGated =
            nextFreeModel &&
            nextFreeModel.startsWith('gemini-3') &&
            nextFreeModel.endsWith('-preview');

          if (nextFreeModel && !hasSwitchedToSecondary && !isNextGated) {
            this.logger.warn(
              `Gemini 429 for ${currentModel}. Trying alternative free model ${nextFreeModel} on Primary Key...`,
            );
            currentModel = nextFreeModel;
            continue;
          }

          // Free-only (cron/background) work must NEVER touch the billed
          // secondary key. Once free models are exhausted, fail fast and let
          // the daily budget gate hold the cron back until quota resets.
          if (freeOnly && !hasSwitchedToSecondary) {
            this.logger.warn(
              `Gemini 429 for ${currentModel} (free-only). Free models exhausted — not escalating to the billed key.`,
            );
            throw err;
          }

          // 2. If no more free models or already on secondary, check if we can switch from Primary -> Secondary
          if (secondaryApiKey && !hasSwitchedToSecondary) {
            this.logger.warn(
              `Primary Key exhausted (tried: ${Array.from(triedOnCurrentKey).join(', ')}). Switching to SECONDARY API KEY...`,
            );
            activeApiKey = secondaryApiKey;
            activeClient = new GoogleGenAI({ apiKey: activeApiKey });
            hasSwitchedToSecondary = true;
            triedOnCurrentKey.clear(); // Important: we have fresh quotas on the new key
            currentModel = modelName; // Reset to original requested quality
            continue;
          }

          // 3. If we are on Secondary and it hits 429, try other models on Secondary too
          if (hasSwitchedToSecondary) {
            const nextSecondaryModel = freeFallbackOrder.find(
              (m) => !triedOnCurrentKey.has(m),
            );
            if (nextSecondaryModel) {
              this.logger.warn(
                `Secondary Key 429 for ${currentModel}. Falling back to ${nextSecondaryModel} on Secondary...`,
              );
              currentModel = nextSecondaryModel;
              continue;
            }
          }

          // If no fallback and no secondary key remains, wait and retry current model
          this.logger.warn(
            `Gemini 429 for ${currentModel}. No further keys or models available. Retrying in 5s...`,
          );
          await new Promise((r) => setTimeout(r, 5000));
          continue;
        }

        this.logger.error(`Gemini call failed: ${err.message}`, err.stack);
        throw err;
      }
    }
    throw new Error('Gemini request failed after retries');
  }

  private resolveModel(quality?: string): string {
    const models = {
      ...this.defaultModels,
      ...(this.configService.get<Record<string, string>>('gemini.models') ||
        {}),
    };

    // Default to 'medium' if quality is not specified
    if (!quality) return models.medium;

    switch (quality) {
      case 'deep':
        return models.deep;
      case 'high':
        return models.deep;
      case 'low':
        return models.low;
      case 'extraction':
        return models.extraction;
      case 'cron':
        return models.cron;
      case 'summary':
        return models.summary;
      case 'recommendation':
        return models.recommendation;
      case 'scoring':
        return models.scoring;
      case 'medium':
      default:
        return models.medium;
    }
  }
}
