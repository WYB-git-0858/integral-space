import {compileSurface,normalize} from './engine.mjs';
const cartesian=['zyx','zxy','yzx','yxz','xzy','xyz'],cylindrical=['zrt','ztr','rzt','rtz','tzr','trz'],spherical=['rpt','rtp','prt','ptr','trp','tpr'];
export function coordinateContext(system='cartesian',params={}){
  const unique=name=>{let value=name;while(value in params)value+='_c';return value;};
  const r=unique('r'),theta=unique('theta'),rho=unique('rho'),phi=unique('phi');
  const variables=system==='cylindrical'?{r,t:theta,z:'z'}:system==='spherical'?{r:rho,p:phi,t:theta}:{x:'x',y:'y',z:'z'};
  const mapping=system==='cylindrical'?{x:`${r}*cos(${theta})`,y:`${r}*sin(${theta})`,z:'z'}:system==='spherical'?{x:`${rho}*sin(${phi})*cos(${theta})`,y:`${rho}*sin(${phi})*sin(${theta})`,z:`${rho}*cos(${phi})`}:{x:'x',y:'y',z:'z'};
  const jacobian=system==='cylindrical'?r:system==='spherical'?`${rho}^2*sin(${phi})`:'1';
  const display=n=>n.replace(/rho/g,'ρ').replace(/theta/g,'θ').replace(/phi/g,'φ');
  const orders=({cartesian,cylindrical,spherical}[system]||cartesian).map(value=>({value,label:[...value].map(k=>'d'+display(variables[k])).join(' ')}));
  const convention=system==='cylindrical'?`${display(r)}≥0；${display(theta)} 是 xy 平面内从 +x 轴向 +y 轴转过的方位角，取 0≤${display(theta)}≤2π。`:system==='spherical'?`${display(rho)}≥0；${display(phi)} 从 +z 轴量起，0≤${display(phi)}≤π；${display(theta)} 是 xy 平面的方位角，0≤${display(theta)}≤2π。`:'x、y、z 使用等比例直角坐标。';
  const aliases=Object.entries(variables).filter(([k,v])=>v.endsWith('_c')).map(([k,v])=>`${display(v)} 为坐标变量，原式中的 ${display(v.slice(0,-2))} 仍为参数`);
  return{system,variables,mapping,jacobian,orders,convention,aliases,display};
}
export function transformExpression(raw,mapping){
  return normalize(raw).replace(/[a-zA-Z_][a-zA-Z_0-9]*/g,name=>{
    if(mapping[name])return '('+mapping[name]+')';
    if(name.length>1&&/^[xyzabcRrh]+$/.test(name))return [...name].map(c=>mapping[c]?'('+mapping[c]+')':c).join('*');
    return name;
  });
}
export function transformedConstraints(region,rows,context){return(region?.sides||[]).map(side=>{const row=rows.find(r=>r.id===side.id);if(!row)return null;const c=compileSurface(row.expr);return{left:transformExpression(c.lhs,context.mapping),right:transformExpression(c.rhs,context.mapping),side:side.side,id:side.id};}).filter(Boolean);}
export function integrationModel({system='cartesian',order,preset=null,region=null,rows=[],params={}}){
  const context=coordinateContext(system,params),v=context.variables;order=context.orders.some(o=>o.value===order)?order:context.orders[0].value;
  const model={...context,order,constraints:transformedConstraints(region,rows,context),ranges:null,note:'',conditions:'',known:false};
  if(system==='cartesian')return model;
  let id=preset?.id,R='R',a='a',h='h',minor='r';const active=rows.filter(r=>region?.sides?.some(s=>s.id===r.id)),eq=active.map(r=>normalize(r.expr).replace(/[\s*]/g,''));
  if(!id&&eq.length===1){const c=compileSurface(active[0].expr);if(c.lhs.replace(/[\s*]/g,'')==='x^2+y^2+z^2'&&region.sides[0].side==='le'){if(c.rhs.trim()==='R^2')id='sphere';else if(/^\d+(\.\d+)?$/.test(c.rhs.trim())&&+c.rhs>0){id='sphere';R=`sqrt(${c.rhs})`;}}}
  if(!id&&eq.length===3&&eq.includes('x+y+z=2')&&eq.includes('z=xy')&&eq.includes('z=0')&&region.bounds[0][0]>=-1e-7&&region.bounds[1][0]>=-1e-7)id='user-three';
  const positive=(...names)=>names.every(n=>(params[n]??1)>0),bounded=region&&!region.touches;
  const range=(lower,upper)=>({lower,upper});let ranges=null,conditions='',note='';
  if(system==='cylindrical'){
    const r=v.r,t=v.t,z=v.z,zFirst=order.indexOf('z')<order.indexOf('r'),thetaOuter=order.at(-1)==='t',fullAngle=range('0','2*pi');
    if(['sphere','hemisphere','solidcylinder','bowl','twobowls','capcone','torus','ballcone'].includes(id)){
      ranges={t:fullAngle};
      if(id==='sphere'||id==='hemisphere'){
        conditions='R>0';if(!positive('R'))ranges=null;else if(zFirst)Object.assign(ranges,{r:range('0',R),z:range(id==='sphere'?`-sqrt(${R}^2-${r}^2)`:'0',`sqrt(${R}^2-${r}^2)`)});else Object.assign(ranges,{z:range(id==='sphere'?'-'+R:'0',R),r:range('0',`sqrt(${R}^2-${z}^2)`)});
      }else if(id==='solidcylinder'){conditions='R>0，h>0';if(!positive('R','h'))ranges=null;else Object.assign(ranges,{r:range('0',R),z:range('0',h)});}
      else if(id==='bowl'){conditions='a>0';if(!positive('a'))ranges=null;else if(zFirst)Object.assign(ranges,{r:range('0',`sqrt(${a})`),z:range(`${r}^2`,a)});else Object.assign(ranges,{z:range('0',a),r:range('0',`sqrt(${z})`)});}
      else if(id==='twobowls'){conditions='a>0';if(!positive('a'))ranges=null;else if(zFirst)Object.assign(ranges,{r:range('0',`sqrt(${a}/2)`),z:range(`${r}^2`,`${a}-${r}^2`)});else{Object.assign(ranges,{z:range('0',a),r:range('0',`sqrt(min(${z},${a}-${z}))`)});note='若不用 min 表示上界，应在 z=a/2 处分成两段积分。';}}
      else if(id==='capcone'){conditions='h>0';if(!positive('h'))ranges=null;else if(zFirst)Object.assign(ranges,{r:range('0',h),z:range(r,h)});else Object.assign(ranges,{z:range('0',h),r:range('0',z)});}
      else if(id==='torus'){conditions='R>r>0（r 是原公式的管半径参数）';if(!positive('R','r')||(params.R??1)<=(params.r??1))ranges=null;else if(zFirst)Object.assign(ranges,{r:range(`${R}-${minor}`,`${R}+${minor}`),z:range(`-sqrt(${minor}^2-(${r}-${R})^2)`,`sqrt(${minor}^2-(${r}-${R})^2)`)});else Object.assign(ranges,{z:range('-'+minor,minor),r:range(`${R}-sqrt(${minor}^2-${z}^2)`,`${R}+sqrt(${minor}^2-${z}^2)`)});}
      else if(id==='ballcone'){conditions='R>0';if(!positive('R'))ranges=null;else if(zFirst)Object.assign(ranges,{r:range('0',`${R}/sqrt(2)`),z:range(r,`sqrt(${R}^2-${r}^2)`)});else{Object.assign(ranges,{z:range('0',R),r:range('0',`min(${z},sqrt(${R}^2-${z}^2))`)});note='若不用 min 表示上界，应在 z=R/√2 处分段。';}}
    }else if(id==='ellipsoid'&&thetaOuter&&positive('a','b','c')){conditions='a,b,c>0';const k=`(cos(${t})^2/a^2+sin(${t})^2/b^2)`;ranges={t:fullAngle};if(zFirst)Object.assign(ranges,{r:range('0',`1/sqrt(${k})`),z:range(`-c*sqrt(1-${k}*${r}^2)`,`c*sqrt(1-${k}*${r}^2)`)});else Object.assign(ranges,{z:range('-c','c'),r:range('0',`sqrt((1-${z}^2/c^2)/${k})`)});}
    else if(id==='tetra'&&thetaOuter&&positive('a')){conditions='a>0';const q=`(cos(${t})+sin(${t}))`;ranges={t:range('0','pi/2')};if(zFirst)Object.assign(ranges,{r:range('0',`${a}/${q}`),z:range('0',`${a}-${r}*${q}`)});else Object.assign(ranges,{z:range('0',a),r:range('0',`(${a}-${z})/${q}`)});}
    else if(id==='user-three'&&order==='zrt'){ranges={t:range('0','pi/2'),r:range('0',`2/(cos(${t})+sin(${t}))`),z:range('0',`min(${r}^2*cos(${t})*sin(${t}),2-${r}*(cos(${t})+sin(${t})))`)};note='平面上界与双曲抛物面上界取较小值；拆开 min 时，需要沿两张上界的交线分段。';}
  }else if(system==='spherical'){
    const rho=v.r,p=v.p,t=v.t,radialFirst=order[0]==='r';
    if(['sphere','hemisphere','ballcone'].includes(id)&&positive('R')){conditions='R>0';ranges={r:range('0',R),p:range('0',id==='sphere'?'pi':id==='hemisphere'?'pi/2':'pi/4'),t:range('0','2*pi')};}
    else if(id==='ellipsoid'&&radialFirst&&positive('a','b','c')){conditions='a,b,c>0';ranges={r:range('0',`1/sqrt(sin(${p})^2*cos(${t})^2/a^2+sin(${p})^2*sin(${t})^2/b^2+cos(${p})^2/c^2)`),p:range('0','pi'),t:range('0','2*pi')};}
    else if(id==='tetra'&&radialFirst&&positive('a')){conditions='a>0';ranges={r:range('0',`${a}/(sin(${p})*cos(${t})+sin(${p})*sin(${t})+cos(${p}))`),p:range('0','pi/2'),t:range('0','pi/2')};}
    else if(id==='bowl'&&radialFirst&&positive('a')){conditions='a>0';ranges={r:range('0',`min(cos(${p})/sin(${p})^2,${a}/cos(${p}))`),p:range('0','pi/2'),t:range('0','2*pi')};note='在 φ=0 与 φ=π/2 处按极限理解上界；拆开 min 时，以 φ=atan(1/√a) 分段。此模型通常用柱坐标更简洁。';}
    else if(id==='solidcylinder'&&radialFirst&&positive('R','h')){conditions='R,h>0';ranges={r:range('0',`min(${R}/sin(${p}),${h}/cos(${p}))`),p:range('0','pi/2'),t:range('0','2*pi')};note='端点处按极限理解；拆开 min 时，以 φ=atan(R/h) 分段。圆柱通常用柱坐标更简洁。';}
    else if(id==='capcone'&&radialFirst&&positive('h')){conditions='h>0';ranges={r:range('0',`${h}/cos(${p})`),p:range('0','pi/4'),t:range('0','2*pi')};}
  }
  model.conditions=conditions;model.note=note;
  if(['sphere','hemisphere','ballcone'].includes(id)&&model.constraints.length){const sphere=active.find(row=>compileSurface(row.expr).lhs.replace(/[\s*]/g,'')==='x^2+y^2+z^2'),constraint=model.constraints.find(c=>c.id===sphere?.id);if(constraint)Object.assign(constraint,{left:system==='spherical'?`${v.r}^2`:`${v.r}^2+z^2`,right:`${R}^2`});}
  if(ranges&&bounded){model.ranges=ranges;model.known=true;}
  else if(!region)model.note='先输入曲面并生成有界立体；这里先展示换元关系和体积微元。';
  else if(region.touches)model.note='当前区域接触绘图边界，请先检查是否被截断；这里显示换元后的约束。';
  else model.note=(conditions?'先检查参数是否满足 '+conditions+'。':'')+'当前组合或所选次序未配置可靠的解析上下限。换元后的约束已列出，需要据此求交或分段；角度不能一律取整周。';
  return model;
}
