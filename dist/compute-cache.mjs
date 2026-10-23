// Small bounded LRU: workers retain geometry without allowing a long session
// of parameter sweeps to keep every sampled array alive.
export class ComputeCache{
  constructor(limit=32*1024*1024){this.limit=limit;this.bytes=0;this.items=new Map();this.hits=0;this.misses=0;}
  get(key){const e=this.items.get(key);if(!e){this.misses++;return undefined;}this.items.delete(key);this.items.set(key,e);this.hits++;return e.value;}
  set(key,value,bytes=1024){if(bytes>this.limit)return value;if(this.items.has(key)){this.bytes-=this.items.get(key).bytes;this.items.delete(key);}this.items.set(key,{value,bytes});this.bytes+=bytes;while(this.bytes>this.limit){const first=this.items.keys().next().value;this.bytes-=this.items.get(first).bytes;this.items.delete(first);}return value;}
}
export const parameterKey=(names,params)=>names.map(n=>[n,params[n]??1]);
export const sceneKey=(rows,params,bounds,n)=>JSON.stringify([rows.filter(r=>r.visible&&r.expr.trim()).map(r=>[r.id,r.expr,r.side??'auto']),Object.entries(params).sort(([a],[b])=>a.localeCompare(b)),bounds,n]);
