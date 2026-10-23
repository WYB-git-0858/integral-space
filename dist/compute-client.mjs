// At most one active job and one latest pending job. A persistent worker keeps
// its module and geometry caches; obsolete intermediate edits never queue up.
export function createComputeClient(url,{result,preview=()=>{},error=()=>{}}){
  let worker=null,active=null,pending=null,serial=0,lastKey=null,busy=false;
  function boot(){worker=new Worker(url,{type:'module'});worker.onmessage=({data})=>{if(!active||data.id!==active.id)return;if(data.phase==='surfaces'){if(!pending)preview(data);return;}const finished=active;active=null;busy=false;if(!pending){lastKey=data.error?null:finished.key;data.error?error(data.error):result(data);}if(pending){const next=pending;pending=null;start(next);}};worker.onerror=e=>{worker.terminate();worker=null;active=null;busy=false;lastKey=null;error(e.message||'计算线程异常');if(pending){const next=pending;pending=null;start(next);}};}
  function start(job){if(!worker)boot();active=job;busy=true;worker.postMessage(job.data);}
  return{submit(data){const key=JSON.stringify([data.rows.filter(r=>r.visible&&r.expr.trim()).map(r=>[r.id,r.expr,r.side]),data.params,data.bounds,data.n]);if(!active&&key===lastKey)return false;if(active?.key===key){pending=null;return true;}const id=++serial,job={id,key,data:{...data,id}};if(active)pending=job;else start(job);return true;},get busy(){return busy;},dispose(){worker?.terminate();worker=null;active=null;pending=null;}};
}
