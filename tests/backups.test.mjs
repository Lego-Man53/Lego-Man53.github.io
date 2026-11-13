import assert from 'node:assert/strict';
import { planBackupRemoval, reviewBackups, removeReviewedBackups } from '../lib/backups.js';
const base = {photos:[{id:'one',title:'Rhino',caption:'Keep this caption',visible:false,homepage:false,storage_path:'display.jpg',preview_path:'preview.jpg',source_path:'original.jpg'}],settings:{layout:'editorial',columns:3,hero_id:null,revision:8}};
const files = [{id:'1',name:'display.jpg',metadata:{size:220000}},{id:'2',name:'preview.jpg',metadata:{size:40000}},{id:'3',name:'original.jpg',metadata:{size:12000000}}];
const plan=planBackupRemoval(base,files);
assert.equal(plan.backups.length,1);assert.equal(plan.bytes,12000000);
assert.throws(()=>planBackupRemoval({...base,photos:[{...base.photos[0],source_path:'display.jpg'}]},files),/still used/);
assert.throws(()=>planBackupRemoval(base,files.filter(f=>f.name!=='preview.jpg')),/could not be verified/);
assert.throws(()=>planBackupRemoval({...base,photos:[...base.photos,{id:'two',storage_path:'original.jpg'}]},files),/still used/,'Protect files referenced by any photo, not just the backup owner');
function mock({stale=false,deleteError=false,retainDeleted=false,captionEdit=false,saveConflict=false}={}) {
 const state={gallery:structuredClone(base),files:structuredClone(files),removed:[],saved:[],reads:0,saveConflict};
 return {state,async rpc(name,args){
  if(name==='read_photo_admin') {state.reads++;if(stale&&state.reads>1)state.gallery.settings.revision++;if(captionEdit&&state.removed.length)state.gallery.photos[0].caption='New caption from another tab';return {data:structuredClone(state.gallery)};}
  state.saved.push(args);
  if(state.saveConflict){state.saveConflict=false;state.gallery.settings.revision++;return {error:Error('Changes were saved by another session. Reload before saving.')};}
  assert.equal(args.expected_revision,state.gallery.settings.revision);
  state.gallery.photos=structuredClone(args.photo_rows);state.gallery.settings.revision++;
  return {data:{revision:state.gallery.settings.revision}};
 },storage:{from(bucket){assert.equal(bucket,'photos');return {async list(){return {data:structuredClone(state.files)};},async remove(paths){state.removed.push(paths);if(deleteError)return {error:Error('Delete denied')};if(!retainDeleted)state.files=state.files.filter(f=>!paths.includes(f.name));return {data:paths.map(name=>({name}))};}};}}};
}
const client=mock();const review=await reviewBackups(client);const result=await removeReviewedBackups(client,review);
assert.deepEqual(client.state.removed,[['original.jpg']]);assert.equal(result.bytes,12000000);
assert.equal(client.state.gallery.photos[0].caption,'Keep this caption');assert.equal(client.state.gallery.photos[0].visible,false);
assert.equal(client.state.gallery.photos[0].storage_path,'display.jpg');assert.equal(client.state.gallery.photos[0].preview_path,'preview.jpg');assert.equal(client.state.gallery.photos[0].source_path,null);
assert.equal(client.state.files.length,2);
const stale=mock({stale:true});const old=await reviewBackups(stale);await assert.rejects(removeReviewedBackups(stale,old),/changed/);assert.equal(stale.state.removed.length,0);
const denied=mock({deleteError:true});await assert.rejects(removeReviewedBackups(denied,await reviewBackups(denied)),/Delete denied/);assert.equal(denied.state.saved.length,0);
const remains=mock({retainDeleted:true});await assert.rejects(removeReviewedBackups(remains,await reviewBackups(remains)),/remain/);assert.equal(remains.state.saved.length,0);
const edits=mock({captionEdit:true,saveConflict:true});await removeReviewedBackups(edits,await reviewBackups(edits));assert.equal(edits.state.gallery.photos[0].caption,'New caption from another tab');assert.equal(edits.state.saved.length,2);
const missing=mock();missing.state.files=missing.state.files.filter(f=>f.name!=='original.jpg');const none=await reviewBackups(missing);assert.equal(none.backups.length,0);await removeReviewedBackups(missing,none);assert.equal(missing.state.removed.length,0);assert.equal(missing.state.gallery.photos[0].source_path,null);
console.log('Backup-only deletion, verified compressed copies, stale review rejection, caption preservation, conflict retry, and failed-delete handling passed.');
