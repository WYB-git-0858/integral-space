import {compileSurface} from './engine.mjs';
import {ComputeCache,sceneKey} from './compute-cache.mjs';
import {stitch} from './analysis.mjs';
export function compileCurve(raw){
  if(/\bz\b/.test(raw))throw Error('二维实验室使用 x、y；含 z 的曲面请切换三维实验室');
  return compileSurface(/[=<>≤≥]/.test(raw)?raw:'y='+raw);
}
const area=p=>Math.abs(p.reduce((s,v,i)=>{const w=p[(i+1)%p.length];return s+v[0]*w[1]-w[0]*v[1];},0))/2;
function clip(poly,f,sign){
  const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],u=a[2+f]*sign,v=b[2+f]*sign;
    if(u<=0)out.push(a);if((u<0&&v>0)||(u>0&&v<0)){const t=u/(u-v);out.push(a.map((x,d)=>x+t*(b[d]-x)));}}
  return out.filter((v,i)=>!i||Math.hypot(v[0]-out[i-1][0],v[1]-out[i-1][1])>1e-14);
}
function knots(b,n){const a=Array.from({length:n+1},(_,i)=>b[0]+(b[1]-b[0])*i/n);if(b[0]<0&&b[1]>0){const i=Math.round(-b[0]/(b[1]-b[0])*n);if(i>0&&i<n){a[i]=0;if(n<=40){const step=(b[1]-b[0])/n;for(const sign of[-1,1])for(let k=1;k<=4;k++){const j=i+sign*k;if(j>0&&j<n)a[j]=sign*step*4**(k-4);}}}}return a;}
function arrange(fields,params,bounds,n,curves=false,detail=null){
  const axes=bounds.map((b,d)=>detail?[...new Set([...knots(b,Math.ceil(n/2)),...knots(detail[d],Math.ceil(n/2))])].sort((a,b)=>a-b):knots(b,n)),nx=axes[0].length-1,ny=axes[1].length-1,span=Math.max(...bounds.map(b=>b[1]-b[0])),tol=span*1e-9,parts=[],edges=new Map(),lines=fields.map(()=>[]),auto=fields.some(f=>f.side==='auto'),onlyCurves=fields.every(f=>f.side==='none'),scales=fields.map(()=>0);
  const values=axes[1].flatMap(y=>axes[0].map(x=>{const v=[x,y,...fields.map(f=>f.c.fn(x,y,0,params))];v.slice(2).forEach((a,i)=>{if(Number.isFinite(a))scales[i]=Math.max(scales[i],Math.abs(a));});return v;}));
  const key=v=>Math.round(v[0]/tol)+','+Math.round(v[1]/tol),edgeKey=(a,b)=>[key(a),key(b)].sort().join('|');
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
    const a=i+j*(nx+1),ids=[[a,a+1,a+nx+2],[a,a+nx+2,a+nx+1]];
    for(const ids3 of ids){const tri=ids3.map(i=>values[i]);if(tri.some(v=>v.some(x=>!Number.isFinite(x))))continue;
      if(curves)for(let f=0;f<fields.length;f++){const pts=[];for(let k=0;k<3;k++){const a=tri[k],b=tri[(k+1)%3],u=a[2+f],v=b[2+f];if(u===0)pts.push(a);if(u*v<0){const t=u/(u-v);pts.push(a.map((x,d)=>x+t*(b[d]-x)));}}const unique=[...new Map(pts.map(p=>[key(p),p])).values()];if(unique.length===2)lines[f].push(unique.map(p=>p.slice(0,2)));}
      if(onlyCurves)continue;
      let pieces=[{poly:tri,mask:0}];for(let f=0;f<fields.length;f++){const next=[];for(const p of pieces){if(fields[f].side==='none'){next.push(p);continue;}const signs=fields[f].side==='auto'?[1,-1]:[fields[f].side==='le'?1:-1];for(const sign of signs){const poly=clip(p.poly,f,sign);if(poly.length>=3&&area(poly)>tol*tol)next.push({poly,mask:p.mask|(sign<0?1<<f:0)});}}pieces=next;if(!pieces.length)break;}
      for(const p of pieces){p.id=parts.length;p.neighbors=[];p.area=area(p.poly);p.open=p.poly.some(v=>bounds.some((b,d)=>Math.abs(v[d]-b[0])<tol||Math.abs(v[d]-b[1])<tol));parts.push(p);for(let k=0;k<p.poly.length;k++){const a=p.poly[k],b=p.poly[(k+1)%p.poly.length];if(Math.hypot(a[0]-b[0],a[1]-b[1])<=tol)continue;const ek=p.mask+':'+edgeKey(a,b),previous=edges.get(ek);if(previous!==undefined){p.neighbors.push(previous.id);parts[previous.id].neighbors.push(p.id);edges.delete(ek);}else edges.set(ek,{id:p.id,a,b});}}
    }
  }
  const regions=[];let open=0;
  for(const seed of parts){if(seed.seen)continue;const queue=[seed.id],members=[];seed.seen=true;let touches=false,total=0;while(queue.length){const p=parts[queue.pop()];members.push(p);total+=p.area;touches||=p.open;for(const id of p.neighbors)if(!parts[id].seen){parts[id].seen=true;queue.push(id);}}
    if(auto&&touches){open++;continue;}if(!members.length)continue;
    const box=[[Infinity,-Infinity],[Infinity,-Infinity]];for(const p of members)for(const v of p.poly)for(let d=0;d<2;d++){box[d][0]=Math.min(box[d][0],v[d]);box[d][1]=Math.max(box[d][1],v[d]);}
    regions.push({area:total,touches,bounds:box,members,mask:seed.mask});
  }
  regions.sort((a,b)=>b.area-a.area);const result=[];
  for(const r of regions.slice(0,12)){const triangles=[],boundary=[];const memberIds=new Set(r.members.map(p=>p.id));for(const p of r.members)for(let i=1;i<p.poly.length-1;i++)triangles.push(...p.poly[0].slice(0,2),...p.poly[i].slice(0,2),...p.poly[i+1].slice(0,2));for(const e of edges.values())if(memberIds.has(e.id)){const source=fields.findIndex((f,i)=>f.side!=='none'&&Math.abs(e.a[i+2])<=Math.max(scales[i],1e-30)*1e-8&&Math.abs(e.b[i+2])<=Math.max(scales[i],1e-30)*1e-8);boundary.push({a:e.a.slice(0,2),b:e.b.slice(0,2),source});}
    const loops=stitch(boundary.map(e=>[e.a,e.b]),tol*10);result.push({index:result.length,positions:new Float64Array(triangles),boundary,loops,area:r.area,touches:r.touches,bounds:r.bounds,sides:fields.filter(f=>f.side!=='none').map(f=>{const i=fields.indexOf(f);return{id:f.id,side:f.side==='auto'?(r.mask&(1<<i)?'ge':'le'):f.side};})});}
  return {regions:result,open,lines,automatic:auto,totalRegions:regions.length};
}
export function computePlane(rows,params,bounds,n=120){
  const fields=[],errors=[];for(const row of rows){if(!row.visible||!row.expr.trim())continue;try{const c=compileCurve(row.expr);fields.push({...row,c,side:row.side??'auto'});}catch(e){errors.push({id:row.id,message:e.message});}}
  if(!fields.length)return{curves:[],regions:[],errors,area:0};
  let fine={regions:[],open:0,automatic:false,totalRegions:0};
  if(!errors.length&&fields.some(f=>f.side!=='none')){fine=arrange(fields,params,bounds,32);let focused=bounds;for(let pass=0;pass<2;pass++){let next=focused;if(fine.regions.length&&!fine.regions.some(r=>r.touches)){next=focused.map((b,d)=>{const lo=Math.min(...fine.regions.map(r=>r.bounds[d][0])),hi=Math.max(...fine.regions.map(r=>r.bounds[d][1])),pad=Math.max((hi-lo)*.18,(b[1]-b[0])/(pass?n:32)*.3);return[Math.max(bounds[d][0],lo-pad),Math.min(bounds[d][1],hi+pad)];});}if(pass&&!next.some((b,d)=>b[1]-b[0]<(focused[d][1]-focused[d][0])*.6))break;focused=next;fine=arrange(fields,params,focused,n);}}
  // Curves cover the full plotting range independently of filled-region focusing.
  const detail=fine.regions.length?bounds.map((b,d)=>{const lo=Math.min(...fine.regions.map(r=>r.bounds[d][0])),hi=Math.max(...fine.regions.map(r=>r.bounds[d][1])),pad=(hi-lo)*.2;return[Math.max(b[0],lo-pad),Math.min(b[1],hi+pad)];}):null;
  const full=arrange(fields.map(f=>({...f,side:'none'})),params,bounds,Math.min(n,220),true,detail);
  return{curves:fields.map((f,i)=>({id:f.id,segments:full.lines[i]})),regions:errors.length?[]:fine.regions,errors,area:errors.length?0:fine.regions.reduce((s,r)=>s+r.area,0),automatic:fine.automatic,open:fine.open,totalRegions:fine.totalRegions,n};
}
export function sectionIntervals(region,axis,value){
  const hits=[];for(const e of region.boundary){const a=e.a,b=e.b,u=a[axis]-value,v=b[axis]-value;if((u<=0&&v>0)||(v<=0&&u>0)){const t=u/(u-v);hits.push(a[1-axis]+t*(b[1-axis]-a[1-axis]));}}
  hits.sort((a,b)=>a-b);const out=[];for(let i=0;i+1<hits.length;i+=2)if(hits[i+1]>hits[i])out.push([hits[i],hits[i+1]]);return out;
}
export function createPlaneComputer(){const cache=new ComputeCache(24*1024*1024);return Object.assign((rows,params,bounds,n=140)=>{const key=sceneKey(rows.map(r=>({...r,id:''})),params,bounds,n);let result=cache.get(key);if(!result){result=computePlane(rows,params,bounds,n);result.points=curveIntersections(result.curves,rows,params,bounds);if(!result.errors.length)cache.set(key,result,result.regions.reduce((s,r)=>s+r.positions.byteLength+r.boundary.length*160,0)+result.curves.reduce((s,c)=>s+c.segments.length*160,0)+4096);}const active=rows.filter(r=>r.visible&&r.expr.trim());if(!result.errors.length&&result.curves.some((c,i)=>c.id!==active[i].id)){const ids=new Map(result.curves.map((c,i)=>[c.id,active[i].id]));return{...result,curves:result.curves.map(c=>({...c,id:ids.get(c.id)})),regions:result.regions.map(r=>({...r,sides:r.sides.map(s=>({...s,id:ids.get(s.id)}))})),points:result.points.map(p=>({...p,ids:p.ids.map(id=>ids.get(id))}))};}return result;},{cache});}
export function curveIntersections(curves,rows,params,bounds){
  const points=[],span=Math.max(...bounds.map(b=>b[1]-b[0])),tol=span*1e-7,compiled=new Map(),size=48;
  for(const r of rows)try{compiled.set(r.id,compileCurve(r.expr));}catch{}
  const binsFor=(a,b)=>{const lo=bounds.map((r,d)=>Math.max(0,Math.min(size-1,Math.floor((Math.min(a[d],b[d])-r[0])/(r[1]-r[0])*size)))),hi=bounds.map((r,d)=>Math.max(0,Math.min(size-1,Math.floor((Math.max(a[d],b[d])-r[0])/(r[1]-r[0])*size)))),keys=[];for(let x=lo[0];x<=hi[0];x++)for(let y=lo[1];y<=hi[1];y++)keys.push(x+y*size);return keys;};
  const indexed=curves.map(c=>{const bins=new Map();c.segments.forEach(([a,b],i)=>{for(const key of binsFor(a,b)){if(!bins.has(key))bins.set(key,[]);bins.get(key).push(i);}});return bins;});
  for(let i=0;i<curves.length;i++)for(let j=i+1;j<curves.length;j++){const ca=curves[i],cb=curves[j];for(const[a,b]of ca.segments){const candidates=new Set();for(const key of binsFor(a,b))for(const k of indexed[j].get(key)||[])candidates.add(k);for(const k of candidates){const[c,d]=cb.segments[k];if(Math.max(a[0],b[0])+tol<Math.min(c[0],d[0])||Math.max(c[0],d[0])+tol<Math.min(a[0],b[0])||Math.max(a[1],b[1])+tol<Math.min(c[1],d[1])||Math.max(c[1],d[1])+tol<Math.min(a[1],b[1]))continue;const ux=b[0]-a[0],uy=b[1]-a[1],vx=d[0]-c[0],vy=d[1]-c[1],den=ux*vy-uy*vx;if(Math.abs(den)<tol*tol)continue;const t=((c[0]-a[0])*vy-(c[1]-a[1])*vx)/den,s=((c[0]-a[0])*uy-(c[1]-a[1])*ux)/den;if(t< -1e-6||t>1+1e-6||s< -1e-6||s>1+1e-6)continue;let p=[a[0]+t*ux,a[1]+t*uy];const f=compiled.get(ca.id).fn,g=compiled.get(cb.id).fn,h=span*1e-6;for(let iteration=0;iteration<6;iteration++){const[x,y]=p,F=f(x,y,0,params),G=g(x,y,0,params),fx=(f(x+h,y,0,params)-f(x-h,y,0,params))/(2*h),fy=(f(x,y+h,0,params)-f(x,y-h,0,params))/(2*h),gx=(g(x+h,y,0,params)-g(x-h,y,0,params))/(2*h),gy=(g(x,y+h,0,params)-g(x,y-h,0,params))/(2*h),det=fx*gy-fy*gx;if(!Number.isFinite(det)||Math.abs(det)<1e-14)break;const dx=(F*gy-G*fy)/det,dy=(G*fx-F*gx)/det;if(Math.hypot(dx,dy)>span*.1)break;p=[x-dx,y-dy];}if(p.every(Number.isFinite)&&!points.some(q=>Math.hypot(q.p[0]-p[0],q.p[1]-p[1])<tol))points.push({p,ids:[ca.id,cb.id]});}}}
  return points;
}
