import assert from 'node:assert/strict';
import {compileExpression,compileSurface,computeScene} from '../dist/engine.mjs';
import {presets} from '../dist/presets.mjs';
const value=(s,x=0,y=0,z=0,p={})=>compileExpression(s).fn(x,y,z,p);
assert.equal(value('-x^2',3),-9);assert.equal(value('2^3^2'),512);assert.equal(value('2x+xy+2(x+y)',2,3),20);
assert.ok(Math.abs(value('sin(pi/2)+sqrt(9)+abs(-2)')-6)<1e-12);assert.equal(value('(x+1)/(y+1)',3,1),2);
assert.equal(value('x²+y³',2,2),12);assert.equal(value('max(x,y)',4,2),4);assert.equal(compileSurface('x²+y²+z²≤R²').relation,'<=');
assert.deepEqual(compileSurface('z=a*x+b*y+c').params,['a','b','c']);
for(const s of ['window.alert(1)','x;alert(1)','sqrt(','x=2','sin()'])assert.throws(()=>compileExpression(s));
for(const p of presets){const rows=p.formulas.map(([expr,side],i)=>({id:String(i),expr,side,visible:true}));const r=computeScene(rows,p.params,p.bounds,24);assert.equal(r.errors.length,0,p.name);assert.ok(r.surfaces.every(s=>s.positions.length>0),p.name+' empty surface');if(p.formulas.some(f=>f[1]!=='none')){assert.ok(r.body.count>0,p.name+' empty body');assert.equal(r.body.touches,false,p.name+' clipped');}console.log('preset OK',p.id);}
const run=(id,n=52)=>{const p=presets.find(p=>p.id===id);return computeScene(p.formulas.map(([expr,side],i)=>({id:String(i),expr,side,visible:true})),p.params,p.bounds,n).body;};
for(const [id,exact]of [['sphere',4*Math.PI*8/3],['bowl',2*Math.PI],['solidcylinder',Math.PI*1.5**2*2],['tetra',2.3**3/6],['steinmetz',16*1.5**3/3]]){const b=run(id);const error=Math.abs(b.volume-exact)/exact;assert.ok(error<.07,id+' volume '+error);console.log('volume OK',id,b.volume.toFixed(4),'relative error',error.toFixed(4));}
const unbounded=computeScene([{id:'1',expr:'z=x^2+y^2',side:'ge',visible:true}],{},[[-2,2],[-2,2],[-1,3]],26);assert.equal(unbounded.body.touches,true);
const invalid=computeScene([{id:'1',expr:'z=sqrt(',side:'le',visible:true}],{},[[-2,2],[-2,2],[-2,2]],20);assert.equal(invalid.errors.length,1);assert.equal(invalid.body,null);
const empty=computeScene([{id:'1',expr:'z=1',side:'ge',visible:true},{id:'2',expr:'z=0',side:'le',visible:true}],{},[[-2,2],[-2,2],[-2,2]],20);assert.equal(empty.body.count,0);
console.log('All parser, geometry, boundary and volume checks passed.');

// User regression: equalities alone must identify the bounded first-quadrant
// chamber, while rejecting an unbounded chamber with the SAME inside signs.
const automatic=(expressions,bounds=[[-3,3],[-3,3],[-3,3]],n=44)=>computeScene(expressions.map((expr,i)=>({id:String(i),expr,side:'auto',visible:true})),{},bounds,n);
const original=automatic(['x+y+z=2','z=xy','z=0']);
assert.equal(original.errors.length,0);assert.equal(original.body.regions.length,1);assert.ok(original.body.positions.length>0);assert.ok(original.body.openComponents>0);
assert.deepEqual(original.body.regions[0].sides.map(r=>r.side),['le','le','ge']);
const expected=16/3-4.5*Math.log(3);assert.ok(Math.abs(original.body.volume-expected)/expected<.15);
const precise=automatic(['x+y+z=2','z=xy','z=0'],[[-.5,2.5],[-.5,2.5],[-.3,.9]],64);assert.ok(Math.abs(precise.body.volume-expected)/expected<.04);
console.log('User three-equation regression OK',original.body.volume,'refined estimate',precise.body.volume,'exact',expected);
const blank=automatic(['','   ']);assert.equal(blank.errors.length,0);assert.equal(blank.surfaces.length,0);assert.equal(blank.body,null);
const withBlank=automatic(['x+y+z=2','z=xy','z=0','']);assert.equal(withBlank.errors.length,0);assert.equal(withBlank.body.regions.length,1);
const openAuto=automatic(['z=xy','z=0']);assert.equal(openAuto.body.count,0);assert.equal(openAuto.body.positions.length,0);
const planesAuto=automatic(['x+y+z=2','x-y+z=0','x+2*y-3*z=0']);assert.equal(planesAuto.body.count,0);
const sphereAuto=automatic(['x^2+y^2+z^2=1']);assert.equal(sphereAuto.body.regions.length,1);assert.ok(Math.abs(sphereAuto.body.volume-4*Math.PI/3)/(4*Math.PI/3)<.08);
const twoBodies=automatic(['((x-1.5)^2+y^2+z^2-.64)*((x+1.5)^2+y^2+z^2-.64)=0']);assert.equal(twoBodies.body.regions.length,2);assert.ok(twoBodies.body.regions.every(r=>r.vertices>0));
const manual=computeScene([{id:'1',expr:'x^2+y^2+z^2=1',side:'auto',visible:true},{id:'2',expr:'z=0',side:'ge',visible:true}],{},[[-2,2],[-2,2],[-2,2]],44);assert.equal(manual.body.regions.length,1);assert.ok(Math.abs(manual.body.volume-2*Math.PI/3)/(2*Math.PI/3)<.08);
console.log('Automatic bodies, separate components, manual constraints and blank-row checks passed.');

// A mesh must include the vanishing wedge, not just have a nonzero volume.
// Weld float32 roundoff, ignore collapsed triangles, and require every edge to
// have two incident faces. Check vertical rays through the old missing corner.
function verifyClosedCorner(body,scale=1){
  assert.equal(body.method,'clipped-boundaries');assert.equal(body.normals.length,body.positions.length);
  const p=body.positions,edges=new Map(),precision=1e6/scale;
  const vertex=i=>[p[i],p[i+1],p[i+2]].map(v=>Math.round(v*precision)).join(',');
  let distance=Infinity;
  for(let i=0;i<p.length;i+=3)distance=Math.min(distance,Math.hypot(p[i],p[i+1],p[i+2]));
  assert.ok(distance<scale*1e-7,'Origin must be part of the boundary');
  for(let i=0;i<p.length;i+=9){const vertices=[vertex(i),vertex(i+3),vertex(i+6)];if(new Set(vertices).size<3)continue;for(let j=0;j<3;j++){const [a,b]=[vertices[j],vertices[(j+1)%3]].sort(),key=a+'|'+b;edges.set(key,(edges.get(key)||0)+1);}}
  assert.ok([...edges.values()].every(n=>n===2),'Boundary mesh has an open or nonmanifold edge');
  for(const [qx,qy]of [[.02,.02],[.005,.005],[.001,.002]]){
    const x=qx*scale,y=qy*scale,hits=[];
    for(let i=0;i<p.length;i+=9){const ax=p[i],ay=p[i+1],bx=p[i+3],by=p[i+4],cx=p[i+6],cy=p[i+7],den=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);if(Math.abs(den)<scale**2*1e-18)continue;const u=((by-cy)*(x-cx)+(cx-bx)*(y-cy))/den,v=((cy-ay)*(x-cx)+(ax-cx)*(y-cy))/den;if(u>=-1e-7&&v>=-1e-7&&u+v<=1+1e-7)hits.push(u*p[i+2]+v*p[i+5]+(1-u-v)*p[i+8]);}
    assert.ok(hits.some(z=>Math.abs(z)<scale*1e-7),'Missing lower boundary near origin');
    assert.ok(hits.some(z=>z>scale*1e-9),'Missing upper boundary near origin');
  }
}
verifyClosedCorner(original.body);
for(const scale of [.1,.01]){
  const small=automatic([`x+y+z=${2*scale}`,`z=xy/${scale}`,'z=0'],undefined,30);verifyClosedCorner(small.body,scale);assert.ok(Math.abs(small.body.volume-expected*scale**3)/(expected*scale**3)<.01);console.log('Continuous thin boundary OK, scale',scale);
}
const fast=automatic(['x+y+z=2','z=xy','z=0'],undefined,30);verifyClosedCorner(fast.body);
assert.ok(Math.abs(original.body.volume-expected)/expected<.01);
console.log('Watertight boundary, exact origin, near-origin rays and smooth-normal checks passed.');
