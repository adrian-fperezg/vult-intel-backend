import redis from '../server/redis';

async function testLock() {
  const REBALANCE_LOCK_KEY = 'queue:rebalance:lock';
  
  console.log("🚀 Testing Redis Lock Concurrency Protection...");
  
  try {
    // 1. Clear any existing lock
    await redis.del(REBALANCE_LOCK_KEY);
    
    // 2. First actor acquires the lock
    const lock1 = await redis.set(REBALANCE_LOCK_KEY, 'locked', 'EX', 30, 'NX');
    console.log(`- Actor 1 (First request): ${lock1 === 'OK' ? '✅ Lock ACQUIRED' : '❌ Lock FAILED'}`);
    
    // 3. Second actor tries to acquire the same lock
    const lock2 = await redis.set(REBALANCE_LOCK_KEY, 'locked', 'EX', 30, 'NX');
    console.log(`- Actor 2 (Concurrent request): ${lock2 === null ? '✅ Lock BLOCKED (Correct)' : '❌ Lock ACQUIRED (Error!)'}`);
    
    if (lock1 === 'OK' && lock2 === null) {
      console.log("\n✨ Redis-based Distributed Lock is working perfectly!");
    } else {
      console.error("\n🚨 LOCK FAILURE: Concurrency protection is NOT working.");
      process.exit(1);
    }
  } catch (error) {
    console.error("Error during lock test:", error);
    process.exit(1);
  } finally {
    // Cleanup
    await redis.del(REBALANCE_LOCK_KEY);
    process.exit(0);
  }
}

testLock();
