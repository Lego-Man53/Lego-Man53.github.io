import assert from 'node:assert/strict';
import { createHandler, validateSuggestion } from '../supabase/functions/photo-assist/handler.js';

const suggestion = { title: 'Water & stone', alt: 'A waterfall beside a granite cliff.', caption: 'Water falls through a curtain of mist.', aspect: 'portrait', reason: 'A portrait crop follows the height of the waterfall.' };
const env = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_ANON_KEY: 'public-key', OPENAI_API_KEY: 'private-test-key' };
const image = 'data:image/jpeg;base64,/9j/' + 'A'.repeat(200);
const input = { action: 'suggest', image, width: 1280, height: 960, notes: '' };
async function run(body = input, options = {}) {
  const calls = [];
  const handler = createHandler({ ...env, ...options.env }, async (url, init) => {
    calls.push({ url, ...init });
    if (url.endsWith('/auth/v1/user')) return Response.json(options.expired ? {} : { id: 'admin' }, { status: options.expired ? 401 : 200 });
    if (url.endsWith('/is_photo_admin')) return Response.json(options.nonAdmin ? false : true);
    if (url.endsWith('/reserve_photo_ai_request')) return Response.json(!options.limited);
    if (url === 'https://api.openai.com/v1/responses') {
      if (options.providerError) return Response.json({ error: { message: 'private-test-key SECRET' } }, { status: options.providerError });
      return Response.json({ status: options.incomplete ? 'incomplete' : 'completed', output: [{ type: 'message', content: options.refusal ? [{ type: 'refusal' }] : [{ type: 'output_text', text: JSON.stringify(options.output || suggestion) }] }] });
    }
    throw new Error('Unexpected network request');
  });
  const headers = { 'Content-Type': 'application/json', Origin: options.origin || 'https://yusufmm.com' };
  if (!options.noAuth) headers.Authorization = 'Bearer user-jwt';
  const response = await handler(new Request('https://test.supabase.co/functions/v1/photo-assist', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) }));
  const data = await response.json();
  assert.ok(!JSON.stringify(data).includes('private-test-key'), 'Responses must never expose credentials');
  return { response, data, calls };
}
const success = await run();
assert.deepEqual(success.data.suggestion, suggestion);
assert.equal(success.response.headers.get('Access-Control-Allow-Origin'), 'https://yusufmm.com');
const provider = success.calls.at(-1);
const payload = JSON.parse(provider.body);
assert.equal(provider.headers.Authorization, 'Bearer private-test-key');
assert.ok(success.calls.slice(0, -1).every(call => call.headers.Authorization === 'Bearer user-jwt'));
assert.equal(payload.store, false);
assert.equal(payload.text.format.strict, true);
assert.equal(payload.input[0].content[1].image_url, image);
assert.equal(payload.max_output_tokens, 1000);
assert.equal(payload.model, 'gpt-6-luna');
assert.deepEqual(payload.reasoning, { effort: 'none' }, 'Photo captions should not spend extra reasoning tokens');
const ignoredOverride = await run(input, { env: { OPENAI_PHOTO_MODEL: 'expensive-model' } });
assert.equal(JSON.parse(ignoredOverride.calls.at(-1).body).model, 'gpt-6-luna', 'Do not silently switch to a more expensive model');
for (const options of [{ noAuth: true }, { expired: true }, { nonAdmin: true }, { origin: 'https://another-site.example' }, { limited: true }, { env: { OPENAI_API_KEY: '' } }]) {
  const result = await run(input, options);
  assert.ok(result.response.status >= 400);
  assert.ok(!result.calls.some(call => call.url.includes('api.openai.com')), 'Unauthorized or limited callers cannot spend API credits');
}
for (const bad of [{ ...input, image: 'https://private.example/image' }, { ...input, width: 2000 }, { ...input, notes: 'A'.repeat(1001) }, { ...input, image: image + 'A'.repeat(1600000) }, 'not json']) {
  const result = await run(bad);
  assert.equal(result.response.status, 400);
  assert.ok(!result.calls.some(call => call.url.includes('api.openai.com')));
}
const status = await run({ action: 'status' });
assert.equal(status.data.configured, true);
assert.equal(status.data.model, 'gpt-6-luna');
assert.equal(status.calls.length, 2, 'Connection checks do not spend usage allowance or API credits');
assert.equal((await run({ action: 'status' }, { env: { OPENAI_API_KEY: '' } })).data.configured, false);
assert.equal((await run(input, { providerError: 429 })).data.code, 'quota');
assert.equal((await run(input, { providerError: 401 })).data.code, 'provider');
assert.equal((await run(input, { refusal: true })).data.code, 'refusal');
assert.equal((await run(input, { incomplete: true })).data.code, 'output');
assert.equal((await run(input, { output: { ...suggestion, title: 'A'.repeat(161) } })).data.code, 'output');
assert.throws(() => validateSuggestion({ ...suggestion, aspect: 'huge' }));
const preflight = await createHandler(env)(new Request('https://test.example', { method: 'OPTIONS', headers: { Origin: 'https://yusufmm.com' } }));
assert.equal(preflight.status, 204);
assert.equal(preflight.headers.get('Access-Control-Allow-Methods'), 'POST, OPTIONS');
console.log('AI session/admin checks, preview bounds, secret isolation, structured output, rate limits, and failure handling passed.');
