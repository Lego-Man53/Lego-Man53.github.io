import assert from 'node:assert/strict';
import { fitImage, preparePhoto, uploadPrepared, IMAGE_LIMITS } from '../lib/image-upload.js';
assert.deepEqual(fitImage(6000,4000,2048),{width:2048,height:1365});
assert.deepEqual(fitImage(400,200,2048),{width:400,height:200});
assert.throws(()=>fitImage(0,10,720),/dimensions/);
let closed=0, encoded=[];
const bitmap={width:6000,height:4000,close(){closed++;}};
function canvasFactory({unsupportedWebP=false,noBlob=false,tooLarge=false}={}) {
 return () => ({width:0,height:0,getContext(){return {fillRect(){},drawImage(){}};},toBlob(callback,type,quality){encoded.push({type,quality,width:this.width,height:this.height});callback(noBlob?null:new Blob([new Uint8Array(tooLarge?600000:Math.ceil(this.width*this.height*quality*.1))],{type:unsupportedWebP&&type==='image/webp'?'image/png':type}));}});
}
const file={size:24*1024*1024,type:'image/jpeg'};
const prepared=await preparePhoto(file,{decode:async()=>bitmap,makeCanvas:canvasFactory()});
assert.equal(closed,1,'Decoded images are released after preparing both variants');
assert.equal(prepared.aspect,'landscape');
assert.ok(prepared.display.width<=2048&&prepared.preview.width<=720);
assert.ok(prepared.display.blob.size<=IMAGE_LIMITS.display.bytes);
assert.ok(prepared.preview.blob.size<=IMAGE_LIMITS.preview.bytes);
const jpeg=await preparePhoto(file,{decode:async()=>bitmap,makeCanvas:canvasFactory({unsupportedWebP:true})});
assert.equal(jpeg.display.blob.type,'image/jpeg');assert.equal(jpeg.display.extension,'jpg');
await assert.rejects(preparePhoto(file,{decode:async()=>{throw Error('bad');}}),/could not be opened/);
await assert.rejects(preparePhoto(file,{decode:async()=>bitmap,makeCanvas:canvasFactory({noBlob:true})}),/compressed/);
await assert.rejects(preparePhoto(file,{decode:async()=>bitmap,makeCanvas:canvasFactory({tooLarge:true})}),/small enough/);
assert.equal(closed,4,'Failure paths also close decoded bitmaps');
let uploadCalls=[],removed=[];
const bucket={async upload(...args){uploadCalls.push(args);return {error:null};},async remove(paths){removed.push(paths);return {error:null};}};
let id=0;
const result=await uploadPrepared(bucket,prepared,{uuid:()=>`file-${++id}`});
assert.equal(uploadCalls.length,2);assert.deepEqual(result.paths,['file-1.webp','file-2.webp']);
assert.equal(uploadCalls[0][1],prepared.display.blob,'Upload compressed bytes, never the input file');
assert.equal(uploadCalls[1][1],prepared.preview.blob);
assert.equal(uploadCalls[0][2].contentType,'image/webp');assert.equal(uploadCalls[0][2].upsert,false);
uploadCalls=[];await uploadPrepared(bucket,prepared,{variants:false,uuid:()=>`old-${++id}`});assert.equal(uploadCalls.length,1,'Old schemas still receive a compressed primary image');
let attempts=0;
await assert.rejects(uploadPrepared({async upload(){return {error:++attempts===2?Error('preview failed'):null};},async remove(paths){removed.push(paths);return {error:null};}},prepared,{uuid:()=>`failure-${++id}`}),/preview failed/);
assert.equal(removed.length,1);assert.equal(removed[0].length,1,'The first file is removed when the second fails');
attempts=0;
try {await uploadPrepared({async upload(){return {error:++attempts===2?Error('preview failed'):null};},async remove(){return {error:Error('offline')};}},prepared,{uuid:()=>`cleanup-${++id}`});assert.fail();}catch(error){assert.equal(error.cleanupPaths.length,1,'Failed cleanup remains available to the admin retry queue');}
console.log('Automatic image bounds, budgets, format fallback, resource cleanup, upload bytes, and partial failure checks passed.');
