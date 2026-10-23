export const number=v=>v===0?'0':Math.abs(v)<.001||Math.abs(v)>=1e5?v.toExponential(3):Number(v.toFixed(4)).toString();
export function meshBounds(p,dim=3){const b=Array.from({length:dim},()=>[Infinity,-Infinity]);for(let i=0;i<p.length;i++)if(Number.isFinite(p[i])){const d=i%dim;b[d][0]=Math.min(b[d][0],p[i]);b[d][1]=Math.max(b[d][1],p[i]);}return b;}
export function sliceMesh(p,axis,value){
  const seg=[],span=meshBounds(p).reduce((s,b)=>Math.max(s,b[1]-b[0]),0),tol=span*1e-8||1e-9;
  for(let i=0;i<p.length;i+=9){const tri=[Array.from(p.slice(i,i+3)),Array.from(p.slice(i+3,i+6)),Array.from(p.slice(i+6,i+9))],hits=[];
    for(let j=0;j<3;j++){const a=tri[j],b=tri[(j+1)%3],u=a[axis]-value,v=b[axis]-value;if(Math.abs(u)<=tol)hits.push(a);if(u*v<0){const t=u/(u-v);hits.push(a.map((x,d)=>x+t*(b[d]-x)));}}
    const unique=[...new Map(hits.map(v=>[v.map(x=>Math.round(x/tol)).join(','),v])).values()];if(unique.length===2&&Math.hypot(...unique[0].map((v,d)=>v-unique[1][d]))>tol)seg.push(unique);
  }return seg;
}
export function stitch(segments,tol=1e-6){
  const key=p=>p.map(v=>Math.round(v/tol)).join(','),links=new Map(),used=new Set(),loops=[];
  segments.forEach((s,i)=>s.forEach(p=>{const k=key(p);if(!links.has(k))links.set(k,[]);links.get(k).push(i);}));
  for(let i=0;i<segments.length;i++){if(used.has(i))continue;used.add(i);const chain=[...segments[i]];let point=chain.at(-1);for(let k=0;k<segments.length;k++){const next=(links.get(key(point))||[]).find(j=>!used.has(j));if(next===undefined)break;used.add(next);const s=segments[next];point=key(s[0])===key(point)?s[1]:s[0];chain.push(point);if(key(point)===key(chain[0]))break;}loops.push(chain);}return loops;
}
export function bodyIntersections(body){
  if(!body?.sources)return{segments:[],points:[]};const p=body.positions,box=meshBounds(p),span=Math.max(...box.map(b=>b[1]-b[0])),tol=span*2e-6,edges=new Map(),nodes=new Map(),segments=[];
  const key=v=>v.map(x=>Math.round(x/tol)).join(',');
  for(let i=0;i<p.length;i+=9){const source=body.sources[i/9];const tri=[Array.from(p.slice(i,i+3)),Array.from(p.slice(i+3,i+6)),Array.from(p.slice(i+6,i+9))];for(let j=0;j<3;j++){const a=tri[j],b=tri[(j+1)%3],k=[key(a),key(b)].sort().join('|'),e=edges.get(k);if(e&&e.source!==source){const s={a,b,sources:[e.source,source]};segments.push(s);for(const v of[a,b]){const vk=key(v),node=nodes.get(vk)||{p:v,sources:new Set()};s.sources.forEach(x=>node.sources.add(x));nodes.set(vk,node);}}else if(!e)edges.set(k,{source});}}
  const points=[...nodes.values()].filter(n=>n.sources.size>=3).map(n=>({p:n.p,sources:[...n.sources]}));
  for(let axis=0;axis<3;axis++){const other=[0,1,2].filter(d=>d!==axis),hits=[];for(let i=0;i<p.length;i+=3)if(other.every(d=>Math.abs(p[i+d])<tol))hits.push({p:Array.from(p.slice(i,i+3)),sources:[body.sources[Math.floor(i/9)]]});if(!hits.length)continue;hits.sort((a,b)=>a.p[axis]-b.p[axis]);for(const n of[hits[0],hits.at(-1)]){const old=points.find(q=>Math.hypot(...q.p.map((v,d)=>v-n.p[d]))<tol);if(old)old.sources=[...new Set([...old.sources,...n.sources])];else points.push(n);}}
  return{segments,points};
}
export function surfaceIntersections(surfaces,compiled,params){
  const out=[];for(let a=0;a<surfaces.length;a++)for(let b=a+1;b<surfaces.length;b++){const s=surfaces[a],f=compiled.get(surfaces[b].id);if(!f)continue;const p=s.positions;for(let i=0;i<p.length;i+=9){const tri=[Array.from(p.slice(i,i+3)),Array.from(p.slice(i+3,i+6)),Array.from(p.slice(i+6,i+9))],v=tri.map(p=>f.fn(...p,params));if(v.some(x=>!Number.isFinite(x)))continue;const hits=[];for(let k=0;k<3;k++){const j=(k+1)%3;if(v[k]===0)hits.push(tri[k]);if(v[k]*v[j]<0){const t=v[k]/(v[k]-v[j]);hits.push(tri[k].map((x,d)=>x+t*(tri[j][d]-x)));}}if(hits.length===2)out.push({a:hits[0],b:hits[1],ids:[s.id,surfaces[b].id]});}}return out;
}
export function plot(canvas,{bounds,segments=[],polygons=[],labels=['x','y'],color='#efba69',points=[],lineColor='#94d9bb',dark=true,grid=true}){
  const rect=canvas.getBoundingClientRect(),w=rect.width||360,h=rect.height||230,dpr=Math.min(globalThis.devicePixelRatio||1,2);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.fillStyle=dark?'#17322c':'#fbfcf9';ctx.fillRect(0,0,w,h);
  let b=bounds?.map(b=>[...b])||[[-3,3],[-3,3]];if(!b.every(a=>a.every(Number.isFinite)&&a[1]>a[0]))b=[[-3,3],[-3,3]];
  const pad=34,s=Math.min((w-pad*2)/(b[0][1]-b[0][0]),(h-pad*2)/(b[1][1]-b[1][0])),cx=(b[0][0]+b[0][1])/2,cy=(b[1][0]+b[1][1])/2;
  const xy=p=>[w/2+(p[0]-cx)*s,h/2-(p[1]-cy)*s],inverse=(x,y)=>[cx+(x-w/2)/s,cy-(y-h/2)/s];
  const raw=Math.max(b[0][1]-b[0][0],b[1][1]-b[1][0])/6,base=10**Math.floor(Math.log10(raw)),r=raw/base,step=base*(r<=1?1:r<=2?2:r<=5?5:10);
  const path=(poly,close=false)=>{poly.forEach((p,i)=>{const [x,y]=xy(p);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});if(close)ctx.closePath();};
  ctx.lineWidth=1;ctx.font='10px sans-serif';ctx.fillStyle=dark?'#8da89a':'#617b69';
  for(let d=0;d<2;d++)for(let v=Math.ceil(b[d][0]/step)*step;v<=b[d][1];v+=step){if(!grid&&Math.abs(v)>step*.01)continue;ctx.beginPath();const a=d?[b[0][0],v]:[v,b[1][0]],z=d?[b[0][1],v]:[v,b[1][1]];path([a,z]);ctx.strokeStyle=Math.abs(v)<step*.01?(dark?'#719781':'#8cab9b'):(dark?'#315044':'#e1e8df');ctx.stroke();const [x,y]=xy(d?[b[0][0],v]:[v,b[1][0]]);ctx.fillText(number(v),d?5:x+2,d?y-3:h-12);}
  // A single path prevents internal triangulation from changing fill opacity.
  if(polygons.length){ctx.beginPath();polygons.forEach(p=>{const signed=p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0];},0);path(signed<0?[...p].reverse():p,true);});ctx.fillStyle=color;ctx.globalAlpha=.48;ctx.fill();ctx.globalAlpha=1;}
  for(const seg of segments){ctx.beginPath();path(seg.points||seg);ctx.strokeStyle=seg.color||lineColor;ctx.lineWidth=seg.width||1.7;ctx.stroke();}
  for(const point of points){const p=xy(point.p||point);ctx.beginPath();ctx.arc(...p,3.5,0,Math.PI*2);ctx.fillStyle='#f8d593';ctx.fill();if(point.label){ctx.fillStyle=dark?'#f3e4c4':'#4b6255';ctx.fillText(point.label,p[0]+6,p[1]-6);}}
  ctx.fillStyle=dark?'#a5c7b2':'#365d49';ctx.font='italic 13px Georgia';ctx.fillText(labels[0],w-17,h-12);ctx.fillText(labels[1],8,16);
  return{ctx,xy,inverse,scale:s,width:w,height:h};
}
