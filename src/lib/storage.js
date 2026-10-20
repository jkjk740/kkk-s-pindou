import { createWorkStore } from './work-store.js';
const copy=value=>JSON.parse(JSON.stringify(value));
const content=work=>JSON.stringify({pattern:work.pattern,completedRows:work.completedRows,sourceImageId:work.sourceImageId||null,cutoutId:work.cutoutId||null,originPublicId:work.originPublicId||null,deleted:Boolean(work.deleted)});

function createRepository(platform){
  const store=createWorkStore(platform);
  const subscribers=new Set();
  const notify=kind=>subscribers.forEach(callback=>callback(kind));
  function all(){
    return store.readAll();
  }
  function write(records){const stored=copy(records);stored.forEach(work=>{delete work._baseContent;delete work.sourcePath;delete work.cutoutPath;delete work.workingPath;});store.writeAll(stored);notify('remote');}
  function save(input){
    const records=all();let index=records.findIndex(work=>work.id===input.id);let previous=index>=0?records[index]:null;
    if(previous&&Number.isInteger(input.revision)&&input.revision<previous.revision){
      if(input._baseContent&&input._baseContent===content(previous))input=Object.assign({},input,{revision:previous.revision});
      else {input=Object.assign({},input,{id:null,revision:0,createdAt:Date.now(),pattern:Object.assign({},input.pattern,{name:`${String(input.pattern.name||'我的作品').slice(0,50)}（本机副本）`})});index=-1;previous=null;}
    }
    if(index<0&&records.filter(work=>!work.deleted).length>=40)throw new Error('本机作品已达 40 份，请先导出或整理作品');
    const now=Date.now();
    const work=Object.assign({},previous||{},copy(input),{id:input.id||`work-${now}-${Math.random().toString(36).slice(2,10)}`,createdAt:previous?previous.createdAt:input.createdAt||now,updatedAt:now,revision:input.revision!==undefined?input.revision:previous?previous.revision:0,deleted:false,dirty:true});
    if(!work.pattern||!Array.isArray(work.completedRows)||new Set(work.completedRows).size!==work.completedRows.length||work.completedRows.some(row=>!Number.isInteger(row)||row<0||row>=work.pattern.height))throw new Error('作品进度无效');
    delete work.sourcePath;delete work.cutoutPath;delete work.workingPath;delete work.exampleKind;delete work._baseContent;
    if(index>=0)records[index]=work;else records.unshift(work);
    write(records);notify('local');return Object.assign(copy(work),{_baseContent:content(work)});
  }
  function remove(id){
    const records=all(),work=records.find(item=>item.id===id);if(!work)return;
    if(!work.revision)write(records.filter(item=>item.id!==id));
    else {work.deleted=true;work.dirty=true;work.updatedAt=Date.now();write(records);}
    notify('local');
  }
  function mergeRemote(remote){
    const records=all();
    remote.forEach(incoming=>{const index=records.findIndex(work=>work.id===incoming.id);if(index<0)records.push(Object.assign({},copy(incoming),{dirty:false}));else if(!records[index].dirty)records[index]=Object.assign({},records[index],copy(incoming),{dirty:false});});
    write(records);
  }
  function acknowledge(snapshot,remote){
    const records=all(),index=records.findIndex(work=>work.id===snapshot.id);if(index<0)return;
    if(content(records[index])===content(snapshot))records[index]=Object.assign({},records[index],copy(remote),{dirty:false});
    else records[index].revision=remote.revision;
    write(records);
  }
  function forkConflict(id,remote){
    const records=all(),index=records.findIndex(work=>work.id===id);if(index<0)return;
    if(!records[index].deleted){const fork=copy(records[index]);fork.id=`work-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;fork.pattern.name=`${fork.pattern.name.slice(0,50)}（本机副本）`;fork.revision=0;fork.dirty=true;fork.updatedAt=Date.now();records.unshift(fork);}
    const target=records.findIndex(work=>work.id===id);records[target]=Object.assign({},copy(remote),{dirty:false});write(records);
  }
  function find(id){const work=all().find(item=>item.id===id&&!item.deleted);return work?Object.assign(work,{_baseContent:content(work)}):undefined;}
  function prepareBackend(scope){const records=all();let changed=false;records.forEach(work=>{if(work.syncBackendScope!==scope){work.dirty=true;changed=true;}});if(changed)write(records);}
  return {subscribe(callback){subscribers.add(callback);return ()=>subscribers.delete(callback);},all,list:()=>all().filter(work=>!work.deleted).sort((first,second)=>second.updatedAt-first.updatedAt),find,save,remove,mergeRemote,acknowledge,forkConflict,prepareBackend};
}
export {createRepository};
