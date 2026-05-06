import Redis from 'ioredis';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const REDIS_URL = process.env.REDIS_URL;
console.log('Testing Redis connection to:', REDIS_URL ? REDIS_URL.replace(/:[^:@]+@/, ':****@') : 'undefined');

if (!REDIS_URL) {
  console.error('REDIS_URL not found in .env');
  process.exit(1);
}

const redis = new Redis(REDIS_URL);

redis.on('connect', () => {
  console.log('SUCCESS: Connected to Redis');
  process.exit(0);
});

redis.on('error', (err) => {
  console.error('FAILURE: Redis error:', err.message);
  process.exit(1);
});

setTimeout(() => {
  console.error('TIMEOUT: Could not connect to Redis in 5s');
  process.exit(1);
}, 5000);
