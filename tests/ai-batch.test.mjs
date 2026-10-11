import assert from 'node:assert/strict';
import { suggestBatch } from '../admin/ai.js';

const photos = ['a', 'b', 'c'];
const calls = [], progress = [];
let active = 0;
const complete = await suggestBatch(photos, {
  shouldStop: () => false,
  onProgress: (...args) => progress.push(args),
  suggest: async photo => {
    assert.equal(active++, 0, 'Paid requests must not overlap');
    await new Promise(resolve => setTimeout(resolve, 5));
    calls.push(photo); active--;
  }
});
assert.deepEqual(calls, photos);
assert.deepEqual(progress, [['a', 1, 3], ['b', 2, 3], ['c', 3, 3]]);
assert.equal(complete.completed, 3);
assert.equal(complete.stopped, false);

let stop = false;
const kept = [];
const cancelled = await suggestBatch(photos, {
  shouldStop: () => stop,
  onProgress: () => {},
  suggest: async photo => { stop = true; await Promise.resolve(); kept.push(photo); }
});
assert.deepEqual(kept, ['a'], 'Stopping finishes the current draft and prevents the next paid request');
assert.deepEqual(cancelled, { completed: 1, stopped: true });

const failure = new Error('Hourly limit reached');
const attempted = [];
const limited = await suggestBatch(photos, {
  shouldStop: () => false,
  onProgress: () => {},
  suggest: async photo => { attempted.push(photo); if (photo === 'b') throw failure; }
});
assert.deepEqual(attempted, ['a', 'b'], 'A failure must pause the batch without retrying or requesting later photos');
assert.equal(limited.completed, 1, 'Completed drafts survive a later failure');
assert.equal(limited.error, failure);
assert.deepEqual(await suggestBatch([], { shouldStop: () => false, onProgress: () => { throw new Error('Empty batch'); }, suggest: () => {} }), { completed: 0, stopped: false });
console.log('Batch sequencing, progress, cancellation, and partial failure checks passed.');
