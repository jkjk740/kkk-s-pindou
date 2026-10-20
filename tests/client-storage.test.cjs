const test = require('node:test');
const assert = require('node:assert/strict');
const { createRepository } = require('../src/lib/storage.js');
const pattern = {version:1,paletteId:'mard-221',name:'小猫',width:2,height:2,beadSize:2.6,cells:['H1',null,'B1','H1']};
function platform(){const records=new Map();return {getStorageSync:key=>records.get(key),setStorageSync:(key,value)=>records.set(key,structuredClone(value))};}

test('persists exact pattern and completed rows across repository restarts',()=>{
  const device=platform();const repository=createRepository(device);
  const saved=repository.save({id:'cat-1',pattern,completedRows:[0],createdAt:1});
  assert.equal(saved.dirty,true);
  assert.deepEqual(createRepository(device).find('cat-1').pattern,pattern);
  assert.deepEqual(createRepository(device).find('cat-1').completedRows,[0]);
});
test('write failure leaves persistent state and draft unchanged',()=>{
  const device=platform();const repository=createRepository(device);repository.save({id:'cat-1',pattern,completedRows:[]});
  device.setStorageSync=()=>{throw new Error('quota');};
  assert.throws(()=>repository.save({id:'cat-1',pattern:{...pattern,name:'changed'},completedRows:[0]}));
  assert.equal(repository.find('cat-1').pattern.name,'小猫');
});
test('deleting synchronized works keeps a dirty tombstone and hides them from gallery',()=>{
  const repository=createRepository(platform());repository.save({id:'cat-1',pattern,completedRows:[],revision:2});
  repository.remove('cat-1');
  assert.equal(repository.list().length,0);
  assert.equal(repository.all()[0].deleted,true);
  assert.equal(repository.all()[0].dirty,true);
  assert.equal(repository.all()[0].revision,2);
});
test('remote updates never overwrite dirty local work',()=>{
  const repository=createRepository(platform());repository.save({id:'cat-1',pattern,completedRows:[0],revision:1});
  repository.mergeRemote([{id:'cat-1',pattern:{...pattern,name:'remote'},completedRows:[],revision:3,updatedAt:10,deleted:false}]);
  assert.equal(repository.find('cat-1').pattern.name,'小猫');
  assert.equal(repository.find('cat-1').dirty,true);
});
test('acknowledges exact uploaded snapshot without clearing a newer local edit',()=>{
  const repository=createRepository(platform());const uploaded=repository.save({id:'cat-1',pattern,completedRows:[]});
  repository.save({id:'cat-1',pattern,completedRows:[0]});
  repository.acknowledge(uploaded,{id:'cat-1',pattern,completedRows:[],revision:1,updatedAt:100,deleted:false});
  assert.equal(repository.find('cat-1').dirty,true);
  assert.deepEqual(repository.find('cat-1').completedRows,[0]);
  assert.equal(repository.find('cat-1').revision,1);
});
