
import { Injectable } from '@nestjs/common';

@Injectable()
export class NicknameGeneratorService {
  private adjectives = [
    'Happy', 'Sleepy', 'Grumpy', 'Sneezy', 'Dopey', 'Bashful', 'Doc',
    'Lucky', 'Spicy', 'Chilly', 'Bouncy', 'Fluffy', 'Speedy', 'Lazy',
    'Fuzzy', 'Jumping', 'Flying', 'Rolling', 'Dancing', 'Singing',
  ];

  private nouns = [
    'Panda', 'Tiger', 'Lion', 'Bear', 'Wolf', 'Eagle', 'Hawk',
    'Fox', 'Dog', 'Cat', 'Mouse', 'Rabbit', 'Turtle', 'Dragon',
    'Unicorn', 'Robot', 'Alien', 'Ninja', 'Pirate', 'Wizard',
  ];

  generate(): string {
    const adj = this.adjectives[Math.floor(Math.random() * this.adjectives.length)];
    const noun = this.nouns[Math.floor(Math.random() * this.nouns.length)];
    const num = Math.floor(Math.random() * 1000);
    return `${adj}${noun}${num}`;
  }
}
