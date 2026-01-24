
import { StockTwitsPost } from '../entities/stocktwits-post.entity';

/**
 * TOON-optimized DTO for StockTwits posts.
 * Short keys are used to minimize token consumption in LLM context.
 */
export class StockTwitsToonDto {
  d: string; // date (YYYY-MM-DD)
  l: number; // likes_count
  b: string; // body (cleaned)

  constructor(post: StockTwitsPost) {
    // We drop username to save tokens
    this.l = post.likes_count;
    this.b = this.clean(post.body);
    // Format date efficiently
    this.d = post.created_at instanceof Date 
        ? post.created_at.toISOString().slice(0, 10) 
        : new Date(post.created_at).toISOString().slice(0, 10);
  }

  private clean(text: string): string {
    if (!text) return '';
    return text
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/\s+/g, ' ') // Collapse whitespace
      .replace(/http\S+/g, '') // Remove URLs
      .trim();
  }

  /**
   * Returns a plain object for TOON parser compatibility.
   */
  toPlain() {
    return { d: this.d, l: this.l, b: this.b };
  }
}
