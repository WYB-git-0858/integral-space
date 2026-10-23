import {presets} from '../dist/presets.mjs';
import {computeScene} from '../dist/engine.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const dir=new URL('../dist/previews/',import.meta.url);await mkdir(dir,{recursive:true});
for(const p of presets){
 const rows=p.formulas.map(([expr,side],i)=>({id:String(i),expr,side,visible:true}));
 const result=computeScene(rows,p.params,p.bounds,15),span=Math.max(...p.bounds.map(b=>b[1]-b[0])),center=p.bounds.map(b=>(b[0]+b[1])/2);
 const project=(x,y,z)=>{x=(x-center[0])/span;y=(y-center[1])/span;z=(z-center[2])/span;return[100+(x*.77+y*.64)*100,55+(x*.35-y*.42-z*.87)*100,x-y+z];};
 const triangles=[],palette=['#6b9e8b','#9cb6cc','#bba9c8','#c5a092'];
 const draw=(pos,color,alpha)=>{for(let i=0;i<pos.length;i+=9){const a=project(...pos.slice(i,i+3)),b=project(...pos.slice(i+3,i+6)),c=project(...pos.slice(i+6,i+9)),u=[0,1,2].map(k=>pos[i+3+k]-pos[i+k]),v=[0,1,2].map(k=>pos[i+6+k]-pos[i+k]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...n)||1,shade=.86+.24*(-.3*n[0]-.6*n[1]+n[2])/length,shaded='#'+color.slice(1).match(/../g).map(h=>Math.min(255,Math.max(0,Math.round(parseInt(h,16)*shade))).toString(16).padStart(2,'0')).join('');triangles.push({depth:(a[2]+b[2]+c[2])/3,path:[a,b,c].map(v=>v.slice(0,2).map(x=>x.toFixed(1)).join(',')).join(' '),color:shaded,alpha});}};
 if(result.body&&!result.body.touches&&result.body.count)draw(result.body.positions,'#95b79b',.9);else result.surfaces.forEach((s,i)=>draw(s.positions,palette[i%palette.length],.8));
 triangles.sort((a,b)=>a.depth-b.depth);
 const axis=(a,b)=>{const p1=project(...a),p2=project(...b);return `<path d="M${p1[0]},${p1[1]}L${p2[0]},${p2[1]}"/>`;};
 const axes=[0,1,2].map(i=>{const a=[0,0,0],b=[0,0,0];a[i]=p.bounds[i][0];b[i]=p.bounds[i][1];return axis(a,b);}).join('');
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 110"><g fill="none" stroke="#b8c9b1" stroke-width=".65">${axes}</g><g stroke-width=".2">${triangles.map(t=>`<polygon points="${t.path}" fill="${t.color}" fill-opacity="${t.alpha}" stroke="#578574" stroke-opacity=".3"/>`).join('')}</g></svg>`;
 await writeFile(new URL(p.id+'.svg',dir),svg);console.log(p.id,result.errors.length?'ERROR':'ok',triangles.length);
}
