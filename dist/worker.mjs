import {createSceneComputer,compileSurface} from './engine.mjs';
import {bodyIntersections,surfaceIntersections} from './analysis.mjs';
const compute=createSceneComputer(),analysesByPositions=new WeakMap();
self.onmessage=({data})=>{const start=performance.now();try{const result=compute(data.rows,data.params,data.bounds,data.n,partial=>self.postMessage({id:data.id,phase:'surfaces',...partial}));
  if(result.body?.positions.length){const b=result.body;let analyses=analysesByPositions.get(b.positions);if(!analyses){analyses={all:bodyIntersections(b)};for(const r of b.regions)analyses[r.index]=b.regions.length===1?analyses.all:bodyIntersections({...b,positions:b.positions.subarray(r.start*3,(r.start+r.vertices)*3),sources:b.sources.subarray(r.start/3,(r.start+r.vertices)/3)});analysesByPositions.set(b.positions,analyses);}b.analyses=analyses;}
  if(!result.body?.positions.length){const key='seams:'+JSON.stringify([data.rows.map(r=>[r.id,r.expr,r.visible]),data.params,data.bounds,data.n]);let analysis=compute.cache.get(key);if(!analysis){const c=new Map();for(const r of data.rows)try{c.set(r.id,compileSurface(r.expr));}catch{}analysis={segments:surfaceIntersections(result.surfaces,c,data.params),points:[]};compute.cache.set(key,analysis,analysis.segments.length*160+1024);}result.analysis=analysis;}
  self.postMessage({id:data.id,...result,computeMs:performance.now()-start});
}catch(e){self.postMessage({id:data.id,error:e.message});}};
