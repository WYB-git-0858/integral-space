// Boundary representation of an intersection of continuous implicit surfaces.
// Clip each tetrahedron by the individual half-spaces. In particular, never
// sample max(F1,F2,...) to find an isosurface: a thin wedge can have no negative
// grid vertex even though it has a nonempty interior inside the tetrahedron.
const corners=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
const tets=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]];
const faces=[[1,2,3],[0,3,2],[0,1,3],[0,2,1]];
const NEW=65535,MIXED=65534,VOID=65533,INVALID=65532;
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const mean=vertices=>[0,1,2].map(k=>vertices.reduce((s,v)=>s+v[k],0)/vertices.length);
const faceKey=(t,f,shift=[0,0,0])=>faces[f].map(v=>corners[tets[t][v]].map((x,i)=>x+shift[i]).join(',')).sort().join('|');
const adjacency=tets.map((_,t)=>faces.map((_,f)=>{
  const key=faceKey(t,f);
  for(const shift of [[0,0,0],[-1,0,0],[1,0,0],[0,-1,0],[0,1,0],[0,0,-1],[0,0,1]])for(let nt=0;nt<6;nt++)for(let nf=0;nf<4;nf++){
    if(nt===t&&nf===f&&shift.every(x=>x===0))continue;
    if(key===faceKey(nt,nf,shift))return {shift,tet:nt,face:nf};
  }
  throw Error('Invalid tetrahedral adjacency');
}));
function area(poly){let result=0;for(let i=1;i<poly.length-1;i++)result+=Math.hypot(...cross(sub(poly[i],poly[0]),sub(poly[i+1],poly[0])))/2;return result;}
function volume(poly){const centre=mean(poly.flatMap(f=>f.vertices));let result=0;for(const f of poly)for(let i=1;i<f.vertices.length-1;i++)result+=Math.abs(dot(sub(f.vertices[0],centre),cross(sub(f.vertices[i],centre),sub(f.vertices[i+1],centre))))/6;return result;}
function clip(poly,field,sign,tolerance,lengthTolerance){
  const value=v=>v[3+field]*sign,out=[],cap=[];
  const remember=v=>{if(!cap.some(p=>Math.hypot(p[0]-v[0],p[1]-v[1],p[2]-v[2])<lengthTolerance))cap.push(v);};
  let removed=false;
  for(const face of poly){const vertices=[];
    for(let i=0;i<face.vertices.length;i++){
      const a=face.vertices[i],b=face.vertices[(i+1)%face.vertices.length],va=value(a),vb=value(b),ina=va<=tolerance,inb=vb<=tolerance;
      if(ina){vertices.push(a);if(Math.abs(va)<=tolerance)remember(a);}else removed=true;
      if(ina!==inb){const t=Math.max(0,Math.min(1,va/(va-vb))),v=a.map((x,k)=>x+t*(b[k]-x));v[3+field]=0;vertices.push(v);remember(v);}
    }
    if(vertices.length>=3&&area(vertices)>lengthTolerance**2)out.push({vertices,source:face.source});
  }
  if(removed&&cap.length>=3){
    const centre=mean(cap),u=sub(cap[0],centre);let normal=null;
    for(let i=1;i<cap.length;i++){const c=cross(u,sub(cap[i],centre));if(Math.hypot(...c)>lengthTolerance**2){normal=c;break;}}
    if(normal){const v=cross(normal,u);cap.sort((a,b)=>Math.atan2(dot(sub(a,centre),v)/Math.hypot(...v),dot(sub(a,centre),u)/Math.hypot(...u))-Math.atan2(dot(sub(b,centre),v)/Math.hypot(...v),dot(sub(b,centre),u)/Math.hypot(...u)));if(area(cap)>lengthTolerance**2)out.push({vertices:cap,source:field});}
  }
  return out;
}
function axesFor(bounds,n){return bounds.map(([lo,hi])=>{
  const values=Array.from({length:n+1},(_,i)=>lo+(hi-lo)*i/n);
  // Coordinate planes must be actual mesh knots, even in an adaptive box.
  // This retains the exact origin and the vanishing-thickness coordinate edges.
  if(lo<0&&hi>0){const index=Math.round(-lo/(hi-lo)*n);if(index>0&&index<n)values[index]=0;}
  return values;
});}
function arrange(fields,params,bounds,n,automatic){
  const axes=axesFor(bounds,n),stride=n+1,vertexPlane=stride*stride,total=n**3*6,cellPlane=n*n;
  const samples=fields.map(f=>{const a=new Float64Array(stride**3);let index=0;for(const z of axes[2])for(const y of axes[1])for(const x of axes[0])a[index++]=f.compiled.fn(x,y,z,params);return a;});
  const states=new Uint16Array(total);states.fill(NEW);const labels=new Int32Array(total),mixed=new Map();
  const autoBits=[];let autoCount=0;fields.forEach((f,i)=>autoBits[i]=f.row.side==='auto'?autoCount++:-1);
  const lengthTolerance=Math.min(...bounds.map(b=>b[1]-b[0]))*1e-10;
  const coordinates=index=>{const cell=Math.floor(index/6),i=cell%n,j=Math.floor(cell/n)%n,k=Math.floor(cell/cellPlane);return {i,j,k,t:index%6};};
  function verticesFor(index){const {i,j,k,t}=coordinates(index);return tets[t].map(c=>{const o=corners[c],v=i+o[0]+(j+o[1])*stride+(k+o[2])*vertexPlane;return [axes[0][i+o[0]],axes[1][j+o[1]],axes[2][k+o[2]],...samples.map(s=>s[v])];});}
  function ensure(index){
    if(states[index]!==NEW)return;
    const vertices=verticesFor(index);if(vertices.some(v=>v.slice(3).some(x=>!Number.isFinite(x)))){states[index]=INVALID;return;}
    const ranges=fields.map((_,f)=>{const v=vertices.map(v=>v[3+f]);return [Math.min(...v),Math.max(...v)];});
    let pattern=0,cut=false;
    for(let f=0;f<fields.length;f++){
      const [lo,hi]=ranges[f],side=fields[f].row.side;
      if(side==='auto'){if(hi<=0&&lo<0)pattern|=1<<autoBits[f];else if(lo<0&&hi>0)cut=true;}
      else {if(side==='ge'?hi<=0&&lo<0:lo>=0&&hi>0){states[index]=VOID;return;}if(side==='ge'?lo<0:hi>0)cut=true;}
    }
    if(!cut){states[index]=pattern;return;}
    let parts=[{mask:0,faces:faces.map((face,f)=>({vertices:face.map(v=>vertices[v]),source:-f-1}))}];
    const tetraVolume=Math.abs(dot(sub(vertices[1],vertices[0]),cross(sub(vertices[2],vertices[0]),sub(vertices[3],vertices[0]))))/6;
    for(let f=0;f<fields.length&&parts.length;f++){
      const next=[],tolerance=Math.max(Math.abs(ranges[f][0]),Math.abs(ranges[f][1]))*1e-12,side=fields[f].row.side;
      for(const part of parts){
        const directions=side==='auto'?[[1,part.mask|(1<<autoBits[f])],[-1,part.mask]]:[[side==='ge'?-1:1,part.mask]];
        for(const [sign,mask]of directions){const clipped=clip(part.faces,f,sign,tolerance,lengthTolerance);if(clipped.length>=4&&volume(clipped)>tetraVolume*1e-11)next.push({mask,faces:clipped});}
      }parts=next;
    }
    if(!parts.length){states[index]=VOID;return;}
    for(const part of parts){part.label=0;part.volume=volume(part.faces);part.faceMask=part.faces.reduce((mask,f)=>f.source<0?mask|(1<<(-f.source-1)):mask,0);}
    mixed.set(index,parts);states[index]=MIXED;
  }
  let qTetra=new Int32Array(4096),qMask=new Uint16Array(4096),head=0,tail=0,currentId=0;
  function enqueue(index,mask,id){
    ensure(index);const state=states[index];
    if(state===MIXED){const p=mixed.get(index).find(p=>p.mask===mask);if(!p||p.label)return false;p.label=id;}
    else {if(state!==mask||labels[index])return false;labels[index]=id;}
    if(tail===qTetra.length){const t=new Int32Array(tail*2),m=new Uint16Array(tail*2);t.set(qTetra);m.set(qMask);qTetra=t;qMask=m;}
    qTetra[tail]=index;qMask[tail++]=mask;return true;
  }
  const components=[];
  for(let seed=0;seed<total;seed++){
    ensure(seed);const seeds=states[seed]===MIXED?mixed.get(seed).filter(p=>!p.label).map(p=>p.mask):states[seed]<4096&&!labels[seed]?[states[seed]]:[];
    for(const mask of seeds){
      head=0;tail=0;const component={id:++currentId,pattern:mask,count:0,volume:0,touches:false,invalid:false,boundary:[],bounds:[[Infinity,-Infinity],[Infinity,-Infinity],[Infinity,-Infinity]]};
      if(!enqueue(seed,mask,component.id))continue;
      while(head<tail){
        const index=qTetra[head++],pattern=qMask[head-1],c=coordinates(index),part=states[index]===MIXED?mixed.get(index).find(p=>p.mask===pattern):null,faceMask=part?.faceMask??15;
        const cellVolume=(axes[0][c.i+1]-axes[0][c.i])*(axes[1][c.j+1]-axes[1][c.j])*(axes[2][c.k+1]-axes[2][c.k]);
        component.count++;component.volume+=part?.volume??cellVolume/6;
        let exposed=0;
        for(let face=0;face<4;face++){
          if(!(faceMask&(1<<face)))continue;const adj=adjacency[c.t][face],i=c.i+adj.shift[0],j=c.j+adj.shift[1],k=c.k+adj.shift[2];
          if(i<0||j<0||k<0||i>=n||j>=n||k>=n){component.touches=true;continue;}
          const next=(i+j*n+k*cellPlane)*6+adj.tet;ensure(next);
          if(states[next]===INVALID){component.invalid=true;continue;}
          const nextPart=states[next]===MIXED?mixed.get(next).find(p=>p.mask===pattern):null;
          const connected=nextPart?!!(nextPart.faceMask&(1<<adj.face)):states[next]===pattern;
          if(connected)enqueue(next,pattern,component.id);else exposed|=1<<face;
        }
        if((!automatic||!component.touches)&&((part&&part.faces.some(f=>f.source>=0))||exposed)){
          const vertices=part?null:verticesFor(index);component.boundary.push({part,vertices,exposed});
          const points=part?part.faces.flatMap(f=>f.vertices):vertices;
          for(const v of points)for(let d=0;d<3;d++){component.bounds[d][0]=Math.min(component.bounds[d][0],v[d]);component.bounds[d][1]=Math.max(component.bounds[d][1],v[d]);}
        }
        if(automatic&&component.touches)component.boundary.length=0;
      }
      components.push(component);
    }
  }
  const accepted=components.filter(c=>(!automatic||!c.touches)&&!c.invalid&&c.volume>0&&c.boundary.length).sort((a,b)=>b.volume-a.volume);
  const scales=samples.map(values=>{let max=0;for(const v of values)if(Number.isFinite(v))max=Math.max(max,Math.abs(v));return max;});
  return {components:accepted,openComponents:components.filter(c=>c.touches).length,invalidComponents:components.filter(c=>c.invalid).length,axes,autoBits,lengthTolerance,scales};
}
function render(result,fields,params,automatic){
  const positions=[],normals=[],sources=[],regions=[],normalCache=new Map(),epsilon=Math.min(...result.axes.map(a=>(a.at(-1)-a[0])/(a.length-1)))*1e-3;
  const selected=result.components.slice(0,12);
  for(const component of selected){
    const start=positions.length/3,sides=fields.map((f,i)=>({id:f.row.id,side:f.row.side==='auto'?((component.pattern&(1<<result.autoBits[i]))?'le':'ge'):f.row.side}));
    function emit(poly,source){
      if(source<0){source=fields.findIndex((_,f)=>poly.every(v=>Math.abs(v[3+f])<=result.scales[f]*1e-10));if(source<0)return;}
      const side=sides[source].side,sign=side==='ge'?-1:1;
      for(let i=1;i<poly.length-1;i++){
        let a=poly[0],b=poly[i],c=poly[i+1],normal=cross(sub(b,a),sub(c,a));if(Math.hypot(...normal)<=result.lengthTolerance**2)continue;
        // The clipping plane's gradient fixes orientation independently of
        // polygon ordering; smooth normals remain separate across creases.
        const center=mean([a,b,c]),grad=[0,1,2].map(d=>{const p=[...center],q=[...center];p[d]+=epsilon;q[d]-=epsilon;return (fields[source].compiled.fn(...p,params)-fields[source].compiled.fn(...q,params))*sign;});
        if(dot(normal,grad)<0){[b,c]=[c,b];normal=normal.map(v=>-v);}
        sources.push(source);for(const v of [a,b,c]){
          positions.push(v[0],v[1],v[2]);const key=source+':'+sign+':'+v.slice(0,3).map(x=>Math.round(x/result.lengthTolerance)).join(',');let n=normalCache.get(key);
          if(!n){n=[0,1,2].map(d=>{const p=v.slice(0,3),q=v.slice(0,3);p[d]+=epsilon;q[d]-=epsilon;return (fields[source].compiled.fn(...p,params)-fields[source].compiled.fn(...q,params))*sign;});if(n.some(x=>!Number.isFinite(x))||Math.hypot(...n)<1e-20)n=[...normal];const length=Math.hypot(...n)||1;n=n.map(x=>x/length);normalCache.set(key,n);}normals.push(...n);
        }
      }
    }
    for(const patch of component.boundary){
      const polygons=patch.part?.faces??faces.map((face,f)=>({vertices:face.map(v=>patch.vertices[v]),source:-f-1}));
      for(const face of polygons)if(face.source>=0||(patch.exposed&(1<<(-face.source-1))))emit(face.vertices,face.source);
    }
    regions.push({index:regions.length,start,vertices:positions.length/3-start,count:component.count,volume:component.volume,sides,bounds:component.bounds});
  }
  return {automatic,positions:new Float32Array(positions),normals:new Float32Array(normals),sources:new Int16Array(sources),fieldIds:fields.map(f=>f.row.id),regions,totalRegions:result.components.length,openComponents:result.openComponents,invalidComponents:result.invalidComponents,touches:selected.some(c=>c.touches),count:selected.reduce((s,c)=>s+c.count,0),volume:selected.reduce((s,c)=>s+c.volume,0),constraints:fields.length,method:'clipped-boundaries'};
}
export function buildSolid(fields,params,bounds,n){
  if(fields.filter(f=>f.row.side==='auto').length>12)throw Error('自动识别最多支持 12 张曲面');
  const automatic=fields.some(f=>f.row.side==='auto');
  let result=arrange(fields,params,bounds,Math.min(18,n),automatic);
  if(result.components.length&&result.components.every(c=>!c.touches)){
    const chosen=result.components.slice(0,12),local=bounds.map((b,d)=>{
      const lo=Math.min(...chosen.map(c=>c.bounds[d][0])),hi=Math.max(...chosen.map(c=>c.bounds[d][1])),pad=Math.max((hi-lo)*.18,(b[1]-b[0])/18*.3);
      return [Math.max(b[0],lo-pad),Math.min(b[1],hi+pad)];
    });
    result=arrange(fields,params,local,Math.max(30,n),automatic);
    if(result.components.length&&result.components.every(c=>!c.touches)){
      const chosen=result.components.slice(0,12),focused=local.map((b,d)=>{
        const lo=Math.min(...chosen.map(c=>c.bounds[d][0])),hi=Math.max(...chosen.map(c=>c.bounds[d][1])),pad=Math.max((hi-lo)*.18,(b[1]-b[0])/Math.max(30,n)*.3);
        return [Math.max(bounds[d][0],lo-pad),Math.min(bounds[d][1],hi+pad)];
      });
      if(focused.some((b,d)=>b[1]-b[0]<(local[d][1]-local[d][0])*.6)){
        const refined=arrange(fields,params,focused,Math.max(30,n),automatic);
        if(refined.components.length)result=refined;
      }
    }
  }else if(result.components.length)result=arrange(fields,params,bounds,n,automatic);
  return render(result,fields,params,automatic);
}
