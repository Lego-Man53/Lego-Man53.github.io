import assert from 'node:assert/strict';
import { publicGallery, photoPaths, photoURLs } from '../lib/photos.js';
globalThis.window={PHOTO_CONFIG:{url:'https://test.supabase.co',publishableKey:'public-test-key'}};
const rows=[{id:'cover',storage_path:'cover.webp',preview_path:'cover-small.webp',homepage:false},{id:'home',storage_path:'home.webp',preview_path:'home-small.webp',homepage:true},{id:'journal-only',storage_path:'other.jpg',homepage:false}];
const calls=[];
globalThis.fetch=async (url,options)=>{
 calls.push({url,options});
 assert.equal(options.headers.apikey,'public-test-key');assert.equal(options.headers.Authorization,undefined,'Public requests must never reuse an admin session');
 if(url.includes('/rpc/'))return Response.json({photos:rows,settings:{hero_id:'cover'}});
 const paths=JSON.parse(options.body).paths;return Response.json(paths.map(path=>({path,signedURL:`/object/sign/photos/${path}?token=public`})));};
const home=await publicGallery('./',{homepage:true});assert.equal(home.photos.length,2);assert.equal(calls.length,2);
assert.deepEqual(JSON.parse(calls[1].options.body).paths,['cover.webp','cover-small.webp','home.webp','home-small.webp'],'Homepage does not sign every journal image');
assert.equal(home.photos[0].preview_url,'https://test.supabase.co/storage/v1/object/sign/photos/cover-small.webp?token=public');
assert.equal(home.photos[0].url,'https://test.supabase.co/storage/v1/object/sign/photos/cover.webp?token=public');
assert.deepEqual(photoPaths({storage_path:'main',preview_path:'thumb',source_path:'original'}),['main','thumb','original']);
let requested;
await photoURLs([{storage_path:'main',preview_path:'thumb',source_path:'original'}],{storage:{from(){return {async createSignedUrls(paths){requested=paths;return {data:paths.map(path=>({path,signedUrl:path}))};}};}}});
assert.deepEqual(requested,['main','thumb'],'Viewing a photo does not sign preserved original files');
globalThis.fetch=async()=>Response.json({photos:[],settings:{hero_id:null}});assert.deepEqual((await publicGallery()).photos,[],'An empty gallery stays empty');
globalThis.fetch=async()=>new Response('offline',{status:503});await assert.rejects(publicGallery(),/unavailable/,'Service failures must never resurrect hidden local photos');
window.PHOTO_CONFIG={};const local=await publicGallery('../');assert.ok(local.photos.every(p=>p.url.endsWith('-display.webp')&&p.preview_url.endsWith('-preview.webp')));
console.log('Public request size, private-source isolation, thumbnail selection, empty galleries, and failure behavior passed.');

window.PHOTO_CONFIG={url:'https://test.supabase.co',publishableKey:'public-test-key',fastGallery:true};
const fastCalls=[];
globalThis.fetch=async(url,options)=>{
 fastCalls.push({url,options});
 assert.equal(options.credentials,'omit'); assert.equal(options.headers,undefined,'The fast GET sends no session or API key and needs no CORS preflight');
 return Response.json({delivery:'photo-gallery-v1',photos:[{...rows[0],visible:true,url:'https://test.supabase.co/full',preview_url:'https://test.supabase.co/small'}],settings:{hero_id:'cover'}});
};
const fast=await publicGallery('./',{homepage:true});
assert.equal(fastCalls.length,1); assert.ok(fastCalls[0].url.endsWith('/functions/v1/photo-gallery?view=home&apikey=public-test-key'));
assert.equal(fast.photos[0].preview_url,'https://test.supabase.co/small');
globalThis.fetch=async()=>Response.json({delivery:'photo-gallery-v1',photos:[],settings:{hero_id:null}});
assert.deepEqual((await publicGallery()).photos,[],'An empty fast gallery is authoritative');
const fallbackCalls=[];
globalThis.fetch=async(url,options)=>{
 fallbackCalls.push(url);
 if(url.includes('/functions/'))return new Response('unavailable',{status:503});
 assert.equal(options.headers.Authorization,undefined);
 if(url.includes('/rpc/'))return Response.json({photos:[],settings:{hero_id:null}});
 throw new Error('Unexpected signing');
};
assert.deepEqual((await publicGallery()).photos,[]);
assert.equal(fallbackCalls.length,2,'Function failures fall back to a fresh anonymous read, never cached rows');
globalThis.fetch=async()=>new Response('offline',{status:503});
await assert.rejects(publicGallery(),/unavailable/);
console.log('One public GET, no preflight/session, authoritative empty results, and fresh fallback passed.');
