export function compareValues(actual, expected, path='$') {
 const type=v=>v===null?'null':Array.isArray(v)?'array':typeof v;
 const at=type(actual), et=type(expected);
 if(at!==et)return `${path}: expected ${et}, received ${at}`;
 if(et==='array'){
  if(actual.length!==expected.length)return `${path}: expected ${expected.length} items, received ${actual.length}`;
  for(let i=0;i<expected.length;i++){const error=compareValues(actual[i],expected[i],`${path}[${i}]`);if(error)return error;}
 }else if(et==='object'){
  const a=Object.keys(actual).sort(), e=Object.keys(expected).sort();
  const missing=e.filter(k=>!a.includes(k)),extra=a.filter(k=>!e.includes(k));
  if(missing.length||extra.length)return `${path}: ${missing.length?'missing keys '+missing.join(', '):''}${missing.length&&extra.length?'; ':''}${extra.length?'unexpected keys '+extra.join(', '):''}`;
  for(const key of e){const error=compareValues(actual[key],expected[key],`${path}[${JSON.stringify(key)}]`);if(error)return error;}
 }else if(actual!==expected)return `${path}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`;
 return null;
}
export class PythonEngine {
 constructor(onStatus=()=>{}){this.onStatus=onStatus;this.worker=null;this.pending=null;this.initializing=null;this.ready=false;this.version='';this.generation=0;this.executing=false;}
 async init(){
  if(this.ready)return this.version;
  if(this.initializing)return this.initializing;
  const generation=++this.generation;this.onStatus('loading','Loading Python…');
  this.initializing=new Promise((resolve,reject)=>{
   const worker=this.worker=new Worker(new URL('./python.worker.js',import.meta.url));
   const timer=setTimeout(()=>this.stop('Python took too long to load. Check your connection and restart.', 'init-timeout'),45000);
   this.pending={reject,timer};
   worker.onerror=e=>{if(generation!==this.generation)return;this.stop(e.message||'Python worker could not start. Restart to retry.','worker-error')};
   worker.onmessage=({data})=>{
    if(generation!==this.generation)return;
    if(data.type==='ready'){clearTimeout(timer);this.pending=null;this.ready=true;this.version=data.version;this.onStatus('ready',`Python ${data.version} ready`);resolve(data.version);}
    if(data.type==='init-error'){this.stop('Python could not load. '+data.error,'init-error')}
    if(data.type==='result'&&this.pending){const{resolve,timer}=this.pending;clearTimeout(timer);this.pending=null;this.worker.terminate();this.worker=null;this.ready=false;this.initializing=null;this.onStatus('idle',`Python ${this.version} · ready for a fresh run`);resolve(data);}
   };
   worker.postMessage({type:'init'});
  });
  try{return await this.initializing;}catch(e){this.initializing=null;throw e}
 }
 async run(code,input,{timeoutMs=8000}={}){
  if(this.executing)throw new Error('A Python run is already in progress.');this.executing=true;
  try{await this.init();this.onStatus('running','Running Python…');
  return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>this.stop(`Execution exceeded ${timeoutMs/1000} seconds. The worker was stopped; your draft is safe.`,'timeout'),timeoutMs);this.pending={resolve,reject,timer};this.worker.postMessage({type:'run',code,input});});}finally{this.executing=false;}
 }
 stop(message='Execution stopped. Your draft is safe.',kind='cancelled'){
  this.generation++;const pending=this.pending;this.pending=null;if(pending)clearTimeout(pending.timer);this.worker?.terminate();this.worker=null;this.ready=false;this.initializing=null;this.onStatus('error','Python stopped · restart when ready');const e=new Error(message);e.kind=kind;pending?.reject(e);
 }
 async restart(){this.stop('Python restarted.','restarted');return this.init();}
}
