import {MathfieldElement,convertAsciiMathToLatex,convertLatexToMarkup} from './vendor/mathlive/mathlive.min.mjs';
export const asciiLatex=convertAsciiMathToLatex;
export const latexMarkup=latex=>convertLatexToMarkup(latex);
MathfieldElement.fontsDirectory=new URL('./vendor/mathlive/fonts',import.meta.url).href;
MathfieldElement.soundsDirectory=null;
export function mathEditor(input,onFocus=()=>{}){
  const mf=new MathfieldElement();mf.className='math-editor';mf.mathVirtualKeyboardPolicy='manual';mf.smartFence=true;
  mf.setAttribute('aria-label',input.getAttribute('aria-label').replace('公式','数学公式'));
  mf.setAttribute('placeholder','输入方程');
  const button=document.createElement('button');button.type='button';button.className='formula-mode';button.textContent='切换文本输入';
  input.before(mf);input.before(button);input.hidden=true;input.mathfield=mf;let changing=false;
  const refresh=()=>{if(changing)return;try{mf.setValue(convertAsciiMathToLatex(input.value),{silenceNotifications:true});}catch{}};
  refresh();mf.addEventListener('focus',onFocus);
  mf.addEventListener('input',()=>{changing=true;input.value=mf.getValue('ascii-math').replace(/\\[a-zA-Z]+/g,s=>s.slice(1)).replace(/\u2061/g,'');input.dispatchEvent(new Event('input',{bubbles:true}));changing=false;});
  input.addEventListener('input',refresh);
  button.onclick=()=>{input.hidden=!input.hidden;mf.hidden=!input.hidden;button.textContent=input.hidden?'切换文本输入':'切换数学输入';(input.hidden?mf:input).focus();};
  return mf;
}
export function insertMath(input,token){
  const mf=input?.mathfield;if(!mf||mf.hidden)return false;
  const latex={sqrt:'\\sqrt{#0}',paren:'\\left(#0\\right)',square:'^{2}',power:'^{#0}',frac:'\\frac{#0}{#?}',pi:'\\pi','*':'\\cdot','/':'\\frac{#0}{#?}','<=':'\\le','>=':'\\ge',sin:'\\sin\\left(#0\\right)',cos:'\\cos\\left(#0\\right)',tan:'\\tan\\left(#0\\right)',exp:'e^{#0}',ln:'\\ln\\left(#0\\right)',abs:'\\left|#0\\right|'}[token]||token;
  mf.focus();mf.insert(latex,{selectionMode:'placeholder'});mf.dispatchEvent(new Event('input',{bubbles:true}));return true;
}
