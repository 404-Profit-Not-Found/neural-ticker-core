Here is the "no bullshit" architectural guide to building the Gemini Deep Research module in NestJS, specifically for the financial domain.

### 1\. The Stack & Dependencies

You need the new **v1beta** SDK, not the legacy one.

```bash
npm install @google/genai @nestjs/config rxjs
```

### 2\. The Architecture (High Level)

**Flow:**

1.  **Client:** POSTs a stock ticker (e.g., "NVDA") to start the job.
2.  **Controller:** Establishes an SSE connection immediately.
3.  **Service:** Calls Gemini Interactions API with `background=true` (prevents timeouts) and `stream=true`.
4.  **Stream:** Pushes distinct events (`thought`, `source`, `content`) to the client as they happen.

-----

### 3\. The Service (`research.service.ts`)

This is the core engine. It manages the `GoogleGenAI` client and converts the async iterable from Google into an RxJS Observable that NestJS can stream.

**Key Config:** `thinking_summaries: 'auto'` is mandatory to see the "Thinking..." process.

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { Observable, Subject } from 'rxjs';

export interface ResearchEvent {
  type: 'status' | 'thought' | 'source' | 'content' | 'error';
  data: any;
}

@Injectable()
export class ResearchService {
  private client: GoogleGenAI;
  private readonly AGENT_MODEL = 'deep-research-pro-preview-12-2025';

  constructor(private config: ConfigService) {
    this.client = new GoogleGenAI({ apiKey: this.config.get('GEMINI_API_KEY') });
  }

  streamResearch(ticker: string, questions?: string): Observable<ResearchEvent> {
    const subject = new Subject<ResearchEvent>();
    const prompt = this.buildPrompt(ticker, questions);

    this.runAgent(prompt, subject); // Run async, don't await here
    return subject.asObservable();
  }

  private async runAgent(prompt: string, subject: Subject<ResearchEvent>) {
    try {
      subject.next({ type: 'status', data: 'Initializing Agent...' });

      const stream = await this.client.interactions.create({
        agent: this.AGENT_MODEL,
        input: prompt,
        background: true, // CRITICAL: Offloads execution to Google to avoid HTTP timeouts
        stream: true,
        agent_config: { thinking_summaries: 'auto' }, // CRITICAL: Shows the "reasoning"
      });

      for await (const chunk of stream) {
        // 1. Capture Thoughts (The "Thinking" UI)
        if (chunk.delta?.type === 'thought_summary' || chunk.delta?.part?.thought) {
            subject.next({ type: 'thought', data: chunk.delta.text || 'Thinking...' });
        }
        
        // 2. Capture Sources (The "Sites Browsed" UI)
        if (chunk.groundingMetadata?.groundingChunks) {
          const sources = chunk.groundingMetadata.groundingChunks.map(c => ({
            title: c.web?.title, url: c.web?.uri 
          }));
          subject.next({ type: 'source', data: sources });
        }

        // 3. Capture Content (The Report)
        if (chunk.delta?.type === 'text' || chunk.delta?.text) {
          subject.next({ type: 'content', data: chunk.delta.text });
        }
      }
      
      subject.complete();
    } catch (err) {
      subject.next({ type: 'error', data: err.message });
      subject.complete();
    }
  }

  private buildPrompt(ticker: string, questions?: string): string {
    return `
      ROLE: Senior Equity Research Analyst.
      TASK: Deep dive due diligence on ${ticker}.
      FOCUS: ${questions || 'Growth, Moat, Risks, Valuation'}.
      REQUIREMENTS:
      1. Use Markdown.
      2. Prioritize 10-K/10-Q filings over news snippets.
      3. Create a Markdown table for last 3y Financials.
      4. Cite every numerical claim.
    `;
  }
}
```

-----

### 4\. The Controller (`research.controller.ts`)

Use `@Sse` to handle the long-lived connection.

**Note:** SSE usually uses GET, but for complex financial queries (long prompts), we use a POST structure where the body dictates the stream.

```typescript
import { Controller, Post, Body, Sse, MessageEvent } from '@nestjs/common';
import { ResearchService } from './research.service';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Controller('research')
export class ResearchController {
  constructor(private readonly service: ResearchService) {}

  @Post('stream')
  @Sse() // Content-Type: text/event-stream
  startResearch(@Body() body: { ticker: string; questions?: string }): Observable<MessageEvent> {
    return this.service.streamResearch(body.ticker, body.questions).pipe(
      map((event) => ({
        data: event, // Automatically JSON serialized
        type: event.type, // Allows frontend to verify event listeners
      }))
    );
  }
}
```

-----

### 5\. Client-Side Consumption (How to test)

Since this is an SSE stream via POST, standard `EventSource` won't work (it only supports GET). You have two options:

**Option A: cURL (Terminal)**

```bash
curl -X POST http://localhost:3000/research/stream \
     -H "Content-Type: application/json" \
     -d '{"ticker": "NVDA"}' \
     -N 
```

*(`-N` disables buffering so you see the stream in real-time)*

**Option B: Frontend Code (Microsoft's Fetch Event Source)**
Standard `EventSource` cannot send a body. Use `@microsoft/fetch-event-source`.

```javascript
import { fetchEventSource } from '@microsoft/fetch-event-source';

await fetchEventSource('/research/stream', {
  method: 'POST',
  body: JSON.stringify({ ticker: 'NVDA' }),
  onmessage(msg) {
    const data = JSON.parse(msg.data);
    if (data.type === 'thought') console.log("Thinking:", data.data);
    if (data.type === 'content') appendToMarkdown(data.data);
  }
});
```

### 6\. Production Hardening (The "Gotchas")

1.  **Timeouts:** Your Nginx/AWS LB configuration likely has a 60s timeout. You must increase `proxy_read_timeout` to **20 minutes (1200s)** for this specific route.
2.  **Resumption:** If the client disconnects, the agent keeps running on Google's side (because of `background=true`). You should log the `chunk.interaction.id` in the Service. If the user reconnects, you can technically "reattach" using `previous_interaction_id`, though implementing a proper re-attachment UI is complex.
3.  **Cost:** This agent burns tokens fast. Implement strict rate limiting (`@nestjs/throttler`) on the Controller.

-----

Would you like me to write the **Frontend React hook** that parses this stream into the specific "Glass Box" UI (accordion for thoughts, sidebar for sources) mentioned in the text?



Since you are in December 2025, you have access to the **Gemini 3** and **Gemini 2.5** series. Do not use the older 1.5 or 2.0 models for new development; they are legacy.

Here is the exact list for a stock analysis app and what each is good for.

### 1\. The Models

| Model Name | ID (`model`) | Best For | Why for Stock Analysis? |
| :--- | :--- | :--- | :--- |
| **Gemini 3 Pro** | `gemini-3-pro` | **Deep Reasoning & Strategy** | Use this for analyzing **10-K filings**, earnings call transcripts, and complex "Buy/Sell" thesis generation. It has the highest reasoning capability and fewest hallucinations. |
| **Gemini 2.5 Flash** | `gemini-2.5-flash` | **Speed & Real-time** | Use this for **live news sentiment**, interpreting tick data, or summarizing short press releases. It is 10x faster and cheaper than Pro. |
| **Deep Research Agent** | `deep-research-pro-preview-12-2025` | **Autonomous Investigation** | This is **not a model**, it is an **agent**. Use this to "go find everything about Apple's supply chain risks." It browses the web, reads PDFs, and writes reports autonomously. |

-----

### 2\. How to use them in NestJS

You need to use two different methods in the SDK: `generateContent` for standard models and `interactions.create` for the agent.

#### A. Using Gemini 3 Pro (The Analyst)

*Use for: "Read this 100-page PDF and calculate the Adjusted EBITDA."*

```typescript
// stock-analysis.service.ts
import { GoogleGenAI } from '@google/genai';

// Initialize
const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function analyzeEarningsCall(transcript: string) {
  const response = await client.models.generateContent({
    model: 'gemini-3-pro', 
    contents: [
      { role: 'user', parts: [{ text: `Extract the CEO's tone regarding Q4 guidance: ${transcript}` }] }
    ],
    // Gemini 3 supports "thinking" for complex math/logic
    config: { thinking: true } 
  });

  return response.text();
}
```

#### B. Using Gemini 2.5 Flash (The Ticker)

*Use for: "Is this headline positive or negative? (Respond in 100ms)"*

```typescript
async function getSentiment(headline: string) {
  const response = await client.models.generateContent({
    model: 'gemini-2.5-flash', // Optimized for low latency
    contents: [{ role: 'user', parts: [{ text: `Sentiment (POS/NEG/NEU): ${headline}` }] }],
  });
  
  return response.text();
}
```

#### C. Using Deep Research (The Researcher)

*Use for: "Spend 10 minutes investigating competitor moats."*
**Note:** This requires the Interactions API (as architected in the previous guide).

```typescript
async function startDeepDive(ticker: string) {
  return await client.interactions.create({
    agent: 'deep-research-pro-preview-12-2025', // The Agent
    input: `Conduct a deep dive into ${ticker} focusing on regulatory risks. Gather all available information and resources including news, filings, and press releases, fundamentals, and market data.`,
    background: true,
    stream: true,
  });
}
```

### Summary Recommendation for Your App

1.  **Frontend Dashboard:** Use **Gemini 2.5 Flash** to show quick summaries of news next to stock charts.
2.  **"Generate Report" Button:** Use **Gemini 3 Pro** to process uploaded PDFs/Docs.
3.  **"Deep Dive" Feature:** Use the **Deep Research Agent** for background tasks that take minutes.