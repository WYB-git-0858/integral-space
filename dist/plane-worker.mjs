import {createPlaneComputer} from './plane-engine.mjs';
const compute=createPlaneComputer();
self.onmessage=({data})=>{const start=performance.now();try{const r=compute(data.rows,data.params,data.bounds,data.n);self.postMessage({id:data.id,...r,computeMs:performance.now()-start});}catch(e){self.postMessage({id:data.id,error:e.message});}};
