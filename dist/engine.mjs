import {buildSolid} from './solid.mjs';
import {ComputeCache,parameterKey} from './compute-cache.mjs';
// Safe arithmetic parser. No eval, assignments, property access or arbitrary calls.
const funcs = {sqrt:Math.sqrt,sin:Math.sin,cos:Math.cos,tan:Math.tan,asin:Math.asin,acos:Math.acos,atan:Math.atan,abs:Math.abs,exp:Math.exp,ln:Math.log,log:Math.log,log10:Math.log10,floor:Math.floor,ceil:Math.ceil,min:Math.min,max:Math.max,pow:Math.pow};
export function normalize(s) {
  return s.replace(/[−–]/g,'-').replace(/[×·]/g,'*').replace(/÷/g,'/').replace(/π/g,'pi').replace(/√/g,'sqrt').replace(/²/g,'^2').replace(/³/g,'^3').replace(/⁴/g,'^4').replace(/（/g,'(').replace(/）/g,')').replace(/，/g,',').replace(/\[/g,'(').replace(/\]/g,')').replace(/\{/g,'(').replace(/\}/g,')').replace(/\*\*/g,'^');
}
export function compileExpression(raw) {
  const s=normalize(raw); if(s.length>500) throw Error('公式过长，请控制在 500 字符以内');
  const tokens=[]; let p=0;
  while(p<s.length){
    if(/\s/.test(s[p])){p++;continue;}
    let m=s.slice(p).match(/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
    if(m){tokens.push({type:'num',v:Number(m[0]),pos:p});p+=m[0].length;continue;}
    m=s.slice(p).match(/^[a-zA-Z_][a-zA-Z_0-9]*/);
    if(m){const name=m[0]; if(name.length>1 && /^[xyzabcRrh]+$/.test(name) && !funcs[name]) for(const [offset,v] of [...name].entries()) tokens.push({type:'id',v,pos:p+offset}); else tokens.push({type:'id',v:name,pos:p});p+=name.length;continue;}
    if('+-*/^(),'.includes(s[p])){tokens.push({type:s[p],v:s[p],pos:p});p++;continue;}
    throw Error('表达式第 '+(p+1)+' 位：无法识别“'+s[p]+'”，请使用数学算子和字母');
  }
  tokens.push({type:'end',pos:s.length}); let i=0; const params=new Set(); let depth=0;
  const error=message=>Error('表达式第 '+((tokens[Math.min(i,tokens.length-1)]?.pos??s.length)+1)+' 位：'+message);
  function parse(min=0){
    if(++depth>80) throw Error('括号嵌套过多');
    let t=tokens[i++]||{type:'end'}, left;
    if(t.type==='num'){const v=t.v;left=()=>v;}
    else if(t.type==='+'||t.type==='-'){const f=parse(25);left=t.type==='-'?(x,y,z,q)=>-f(x,y,z,q):f;}
    else if(t.type==='('){left=parse();if(tokens[i++]?.type!==')')throw error('缺少右括号 )');}
    else if(t.type==='id'){
      const name=t.v;
      if(funcs[name]){
        if(tokens[i++]?.type!=='(')throw error(name+' 后面需要括号');
        const args=[parse()];while(tokens[i].type===','){i++;args.push(parse());}
        if(tokens[i++]?.type!==')')throw error('函数缺少右括号');
        if((['min','max','pow'].includes(name)?args.length!==2:args.length!==1))throw Error(name+' 的参数数量不正确');
        const f=funcs[name];left=(x,y,z,q)=>f(...args.map(a=>a(x,y,z,q)));
      } else if(name==='pi')left=()=>Math.PI;
      else if(name==='e')left=()=>Math.E;
      else if(name==='x')left=(x)=>x;
      else if(name==='y')left=(x,y)=>y;
      else if(name==='z')left=(x,y,z)=>z;
      else {params.add(name);left=(x,y,z,q)=>q[name]??1;}
    } else throw error('这里需要数字、变量或括号');
    while(true){
      t=tokens[i];let op=t.type,implicit=false;
      if(['num','id','('].includes(op)){op='*';implicit=true;}
      const prec=op==='+'||op==='-'?10:op==='*'||op==='/'?20:op==='^'?30:-1;
      if(prec<min)break;
      if(!implicit)i++;
      const a=left,b=parse(op==='^'?prec:prec+1);
      if(op==='+')left=(x,y,z,q)=>a(x,y,z,q)+b(x,y,z,q);
      if(op==='-')left=(x,y,z,q)=>a(x,y,z,q)-b(x,y,z,q);
      if(op==='*')left=(x,y,z,q)=>a(x,y,z,q)*b(x,y,z,q);
      if(op==='/')left=(x,y,z,q)=>a(x,y,z,q)/b(x,y,z,q);
      if(op==='^')left=(x,y,z,q)=>Math.pow(a(x,y,z,q),b(x,y,z,q));
    }
    depth--;return left;
  }
  const fn=parse();if(tokens[i]?.type!=='end')throw error('多余的括号或符号');
  return {fn,params:[...params]};
}
export function compileSurface(raw){
  const text=normalize(raw).replace(/≤/g,'<=').replace(/≥/g,'>=');
  const parts=text.split(/(<=|>=|=|<|>)/);
  if(parts.length>3)throw Error('每一行只写一个方程或不等式');
  const lhs=parts.length===1?'z':parts[0], rhs=parts.length===1?text:parts[2];
  const a=compileExpression(lhs),b=compileExpression(rhs);
  return {fn:(x,y,z,p)=>a.fn(x,y,z,p)-b.fn(x,y,z,p),params:[...new Set([...a.params,...b.params])],relation:parts[1]||'=',lhs,rhs};
}
const tetra=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]];
const offsets=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
export function sampleField(fn,bounds,n,params){
  const values=new Float64Array((n+1)**3);let index=0;
  for(let k=0;k<=n;k++)for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){
    const v=fn(bounds[0][0]+(bounds[0][1]-bounds[0][0])*i/n,bounds[1][0]+(bounds[1][1]-bounds[1][0])*j/n,bounds[2][0]+(bounds[2][1]-bounds[2][0])*k/n,params);
    values[index++]=Number.isFinite(v)?v:NaN;
  }return values;
}
export function meshField(values,bounds,n){
  const out=[],stride=n+1,plane=stride*stride,steps=bounds.map(b=>(b[1]-b[0])/n);
  const at=(i,j,k)=>i+j*stride+k*plane;
  const emit=(a,b,c,inside)=>{
    const u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]);
    const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    if(normal.reduce((s,v,i)=>s+v*(inside[i]-a[i]),0)>0)out.push(...a,...c,...b);else out.push(...a,...b,...c);
  };
  for(let k=0;k<n;k++)for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    const vals=offsets.map(o=>values[at(i+o[0],j+o[1],k+o[2])]);
    if(vals.some(v=>!Number.isFinite(v))||vals.every(v=>v>=0)||vals.every(v=>v<0))continue;
    const pts=offsets.map(o=>[bounds[0][0]+(i+o[0])*steps[0],bounds[1][0]+(j+o[1])*steps[1],bounds[2][0]+(k+o[2])*steps[2]]);
    const cut=(a,b)=>{const t=vals[a]/(vals[a]-vals[b]);return pts[a].map((v,l)=>v+t*(pts[b][l]-v));};
    for(const t of tetra){
      const inn=t.filter(a=>vals[a]<0),outer=t.filter(a=>vals[a]>=0);
      if(inn.length===1)emit(cut(inn[0],outer[0]),cut(inn[0],outer[1]),cut(inn[0],outer[2]),pts[inn[0]]);
      if(inn.length===3)emit(cut(outer[0],inn[0]),cut(outer[0],inn[1]),cut(outer[0],inn[2]),pts[inn[0]]);
      if(inn.length===2){const a=cut(inn[0],outer[0]),b=cut(inn[0],outer[1]),c=cut(inn[1],outer[0]),d=cut(inn[1],outer[1]);emit(a,b,c,pts[inn[0]]);emit(b,d,c,pts[inn[0]]);}
    }
  }return new Float32Array(out);
}
export function createSceneComputer(){const cache=new ComputeCache(48*1024*1024);return Object.assign((rows,params,bounds,n=40,preview)=>computeScene(rows,params,bounds,n,cache,preview),{cache});}
export function computeScene(rows,params,bounds,n=40,cache=null,preview=null){
  const fields=[],surfaces=[],errors=[];
  for(const row of rows){
    if(!row.visible||!row.expr.trim())continue;
    try{let compiled=cache?.get('formula:'+row.expr);if(!compiled){compiled=compileSurface(row.expr);cache?.set('formula:'+row.expr,compiled,2048);}const key=JSON.stringify([row.expr,parameterKey(compiled.params,params),bounds,n]);let sampled=cache?.get('surface:'+key);if(!sampled){const values=sampleField(compiled.fn,bounds,n,params);sampled={values,positions:meshField(values,bounds,n)};cache?.set('surface:'+key,sampled,values.byteLength+sampled.positions.byteLength);}surfaces.push({id:row.id,positions:sampled.positions});const side=row.side??(compiled.relation.includes('<')?'le':compiled.relation.includes('>')?'ge':'auto');if(side!=='none')fields.push({row:{...row,side},compiled,values:sampled.values,key});}
    catch(e){errors.push({id:row.id,message:e.message});}
  }
  const bodyKey='body:'+JSON.stringify(fields.map(f=>[f.key,f.row.side]));let body=fields.length&&!errors.length?cache?.get(bodyKey):null;
  if(!body&&fields.length&&!errors.length){preview?.({surfaces,errors,n});body=buildSolid(fields,params,bounds,n);cache?.set(bodyKey,body,body.positions.byteLength+body.normals.byteLength+body.sources.byteLength+8192);}
  if(body&&fields.some((f,i)=>f.row.id!==body.fieldIds[i]))body={...body,fieldIds:fields.map(f=>f.row.id),regions:body.regions.map(r=>({...r,sides:r.sides.map((s,i)=>({...s,id:fields[i].row.id}))}))};
  return {surfaces,body,errors,n};
}
