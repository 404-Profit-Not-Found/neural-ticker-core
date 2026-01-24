
import { StockTwitsPost } from '../entities/stocktwits-post.entity';

/**
 * TOON-optimized DTO for StockTwits posts.
 * Short keys are used to minimize token consumption in LLM context.
 */
export class StockTwitsToonDto {
  u: string; // username
  l: number; // likes_count
  b: string; // body (cleaned)

  constructor(post: StockTwitsPost) {
    this.u = post.username;
    this.l = post.likes_count;
    this.b = this.clean(post.body);
  }

  private clean(text: string): string {
    if (!text) return '';
    return text
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/\s+/g, ' ') // Collapse whitespace
      .trim();
  }

  /**
   * Returns a plain object for TOON parser compatibility.
   */
  toPlain() {
    return { u: this.u, l: this.l, b: this.b };
  }
}
