import 'dotenv/config';
import { AIRouter, ContextCacher, generateText } from './src/services/ai.js';

console.log('Testing AIRouter model selection...');
console.log('Simple task model:', AIRouter.getModel('simple'));
console.log('Complex task model:', AIRouter.getModel('complex'));
