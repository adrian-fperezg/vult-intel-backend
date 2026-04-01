import { test } from 'node:test';
import assert from 'node:assert';
import { evaluateSmartIntent } from './utils.js';

test('Smart Intent Bypass Logic', async (t) => {
  
  await t.test('Scenario 1: Bypass ON + Keyword Match -> replied', () => {
    const result = evaluateSmartIntent({
      smart_intent_bypass: true,
      stop_on_reply: true,
      keywordMatch: true
    });
    
    assert.strictEqual(result.status, 'replied');
    assert.strictEqual(result.matched, true);
  });

  await t.test('Scenario 2: Bypass ON + No Match -> paused', () => {
    const result = evaluateSmartIntent({
      smart_intent_bypass: true,
      stop_on_reply: true,
      keywordMatch: false
    });
    
    assert.strictEqual(result.status, 'paused');
    assert.strictEqual(result.matched, false);
  });

  await t.test('Scenario 3: Bypass OFF + StopOnReply ON -> stopped', () => {
    const result = evaluateSmartIntent({
      smart_intent_bypass: false,
      stop_on_reply: true,
      keywordMatch: true // Should be ignored since bypass is OFF
    });
    
    assert.strictEqual(result.status, 'stopped');
    assert.strictEqual(result.matched, false);
  });

  await t.test('Scenario 4: Bypass OFF + StopOnReply OFF -> active', () => {
    const result = evaluateSmartIntent({
      smart_intent_bypass: false,
      stop_on_reply: false,
      keywordMatch: true
    });
    
    assert.strictEqual(result.status, 'active');
    assert.strictEqual(result.matched, false);
  });

  await t.test('Scenario 5: Bypass ON + Null Match -> paused', () => {
    const result = evaluateSmartIntent({
      smart_intent_bypass: true,
      stop_on_reply: true,
      keywordMatch: null
    });
    
    assert.strictEqual(result.status, 'paused');
    assert.strictEqual(result.matched, false);
  });
});
