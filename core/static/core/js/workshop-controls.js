/** Shared presentation and keyboard controls; never alters artwork geometry. */
export function attachWorkshopControls(root,signal){
  const bar=document.createElement('div');bar.className='workshop-quickbar';
  const focus=document.createElement('button');focus.type='button';focus.className='button secondary';focus.dataset.action='focus';focus.setAttribute('aria-pressed','false');
  const hint=document.createElement('span');hint.textContent='快捷键：Ctrl / ⌘ + Z 撤销 · Shift + Z 重做 · S 保存 · Shift + S 另存';
  bar.append(focus,hint);root.before(bar);
  function setFocus(value){root.classList.toggle('is-focused',value);focus.textContent=value?'退出放大 ↙':'放大画布 ↗';focus.setAttribute('aria-pressed',String(value));}
  setFocus(false);
  focus.addEventListener('click',()=>{setFocus(!root.classList.contains('is-focused'));bar.scrollIntoView({block:'start',behavior:'instant'});},{signal});
  window.addEventListener('keydown',event=>{
    if(document.querySelector('dialog[open]')||event.target.closest('input,textarea,select,[contenteditable="true"]'))return;
    if(event.key==='Escape'){setFocus(false);return;}
    if(!(event.ctrlKey||event.metaKey)||event.altKey||event.repeat)return;
    const key=event.key.toLowerCase();
    const action=key==='s'?(event.shiftKey?'save-copy':'save'):key==='z'?(event.shiftKey?'redo':'undo'):key==='y'?'redo':null;
    if(!action)return;event.preventDefault();const button=root.querySelector(`[data-action="${action}"]`);if(button&&!button.disabled)button.click();
  },{signal});
}
