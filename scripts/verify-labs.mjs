import assert from 'node:assert/strict';
import {computePlane,sectionIntervals,compileCurve} from '../dist/plane-engine.mjs';
import {computeScene,compileExpression} from '../dist/engine.mjs';
import {planePresets} from '../dist/plane-presets.mjs';
import {bodyIntersections,sliceMesh,stitch} from '../dist/analysis.mjs';
const run=(expr,b=[[-3,3],[-3,3]],n=140)=>computePlane(expr.map((expr,i)=>({id:String(i),expr,side:'auto',visible:true})),{},b,n);
for(const p of planePresets){const r=computePlane(p.formulas.map(([expr,side],i)=>({id:String(i),expr,side,visible:true})),p.params,p.bounds,100);assert.equal(r.errors.length,0,p.id);assert.ok(r.curves.every(c=>c.segments.length),p.id);if(p.formulas.some(f=>f[1]!=='none'))assert.ok(r.regions.length,p.id);}
for(const[expr,exact]of[[['x^2+y^2=1'],Math.PI],[['y=x^2','y=x'],1/6],[['y=0','x=0','x+y=2'],2],[['y=x^2','x=y^2'],1/3]]){const r=run(expr);assert.equal(r.regions.length,1);assert.ok(Math.abs(r.area-exact)/exact<.005,expr);}
assert.equal(run(['y=x^2']).regions.length,0);assert.equal(run(['y=x^2','']).regions.length,0);assert.equal(run(['']).regions.length,0);assert.throws(()=>compileCurve('z=x'));assert.throws(()=>compileExpression('sqrt('),/第 .* 位/);
const lens=run(['y=x^2','y=x']).regions[0],interval=sectionIntervals(lens,0,.5);assert.equal(interval.length,1);assert.ok(Math.abs(interval[0][0]-.25)<.001);assert.ok(Math.abs(interval[0][1]-.5)<.001);
for(const s of [.1,.01]){const r=run([`y=x^2/${s}`,'y=x']);assert.equal(r.regions.length,1);assert.ok(Math.abs(r.area-s*s/6)/(s*s/6)<.02);assert.ok(r.regions[0].boundary.some(e=>e.a.every(v=>Math.abs(v)<s*1e-8)),'2D origin retained');}
const annulus=planePresets.find(p=>p.id==='annulus'),ring=computePlane(annulus.formulas.map(([expr,side],i)=>({id:String(i),expr,side,visible:true})),annulus.params,annulus.bounds,140);assert.equal(sectionIntervals(ring.regions[0],0,0).length,2);assert.ok(Math.abs(ring.area-3*Math.PI)/(3*Math.PI)<.005);
const disjoint=run(['((x-1.5)^2+y^2-.25)*((x+1.5)^2+y^2-.25)=0']);assert.equal(disjoint.regions.length,2);
const b=computeScene(['x+y+z=2','z=xy','z=0'].map((expr,i)=>({id:String(i),expr,side:'auto',visible:true})),{},[[-3,3],[-3,3],[-3,3]],30).body;assert.equal(b.sources.length,b.positions.length/9);const seams=bodyIntersections(b);assert.ok(seams.segments.length);assert.ok(seams.points.some(p=>Math.hypot(...p.p)<1e-6));for(const axis of[0,1,2])assert.ok(sliceMesh(b.positions,axis,.25).length);
console.log('All 20 planar presets, analytic areas, tiny regions, annular sections, disjoint regions, 3D seams and slices passed.');
