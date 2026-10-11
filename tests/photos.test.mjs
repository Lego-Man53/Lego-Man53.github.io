import assert from 'node:assert/strict';
import { arrange, validatePhoto, seeds } from '../lib/photos.js';

const moved = arrange(seeds, seeds[0].id, 1);
assert.equal(moved[1].id, seeds[0].id);
assert.equal(seeds[0].sort_order, 0);
assert.deepEqual(moved.map(p => p.sort_order), [0, 1, 2, 3]);
assert.deepEqual(arrange(seeds, seeds[0].id, -1), seeds);
assert.throws(() => validatePhoto({ type: 'image/svg+xml', size: 20 }), /Choose a JPG/);
validatePhoto({ type: 'image/jpeg', size: 16 * 1024 * 1024 });
validatePhoto({ type: 'image/jpeg', size: 30 * 1024 * 1024 });
assert.throws(() => validatePhoto({ type: 'image/jpeg', size: 30 * 1024 * 1024 + 1 }), /30 MB/);
assert.throws(() => validatePhoto({ type: 'image/png', size: 0 }), /empty/);
validatePhoto({ type: 'image/jpeg', size: 100 });
console.log('Photo ordering and upload validation passed.');
