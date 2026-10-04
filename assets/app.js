document.addEventListener('DOMContentLoaded',()=>{
  const menu=document.querySelector('[data-menu]');
  if(menu)menu.addEventListener('click',()=>document.querySelector('.sidebar')?.classList.toggle('open'));
  document.querySelectorAll('[data-confirm]').forEach(el=>el.addEventListener('submit',e=>{if(!confirm(el.dataset.confirm))e.preventDefault()}));
  document.querySelectorAll('[data-auto-submit]').forEach(el=>el.addEventListener('change',()=>el.form?.submit()));
  const wizard=document.querySelector('[data-wizard]');
  if(wizard){let step=0;const panels=[...wizard.querySelectorAll('.wizard-step')];const bar=wizard.querySelector('.wizard-progress span');const show=()=>{panels.forEach((p,i)=>p.classList.toggle('active',i===step));bar.style.width=`${((step+1)/panels.length)*100}%`;wizard.querySelector('[data-prev]').disabled=step===0;wizard.querySelector('[data-next]').classList.toggle('d-none',step===panels.length-1);wizard.querySelector('[data-submit]').classList.toggle('d-none',step!==panels.length-1)};wizard.querySelector('[data-next]').addEventListener('click',()=>{if(step<panels.length-1){step++;show()}});wizard.querySelector('[data-prev]').addEventListener('click',()=>{if(step>0){step--;show()}});show()}
  document.querySelectorAll('[data-demo-fill]').forEach(btn=>btn.addEventListener('click',()=>{const form=btn.closest('form');if(!form)return;form.querySelector('[name=study_type]').value='Маммография';form.querySelector('[name=conclusion]').value='Синтетическое демонстрационное заключение. Следующий шаг заранее задан специалистом.';form.querySelector('[name=step_title]').value='Консультация по результатам';form.querySelector('[name=due_days]').value='7';const n=document.createElement('div');n.className='alert alert-info mt-3';n.textContent='Данные заполнены из демонстрационного сценария';btn.parentElement.appendChild(n)}));
  const routeFilters=document.querySelector('.filter-card form,.filter-card');
  if(routeFilters&&routeFilters.matches('form')&&routeFilters.querySelector('[name=status]')){const row=routeFilters.querySelector('.row');const params=new URLSearchParams(location.search);const make=(name,label,items)=>{const wrap=document.createElement('div');wrap.className='col-lg-2';const select=document.createElement('select');select.className='form-select';select.name=name;select.setAttribute('aria-label',label);items.forEach(([value,text])=>{const option=new Option(text,value,value===params.get(name),value===params.get(name));select.add(option)});wrap.appendChild(select);return wrap};const actions=row.lastElementChild;row.insertBefore(make('assignee','Ответственный',[['','Все ответственные'],['Мария Котова','Мария Котова'],['Ирина Смирнова','Ирина Смирнова']]),actions);row.insertBefore(make('due','Срок',[['','Любой срок'],['overdue','Срок истёк'],['today','Срок сегодня'],['week','Ближайшие 7 дней']]),actions)}
  document.querySelectorAll('input[name="action"][value="demo_call"]').forEach(input=>input.closest('form')?.classList.add('d-none'));
  document.querySelectorAll('[data-copy-call]').forEach(button=>button.addEventListener('click',async()=>{
    const target=document.querySelector(button.dataset.copyCall);
    if(!target)return;
    try{
      await navigator.clipboard.writeText(target.innerText.trim());
      const original=button.textContent;
      button.textContent='Скопировано';
      window.setTimeout(()=>button.textContent=original,1800);
    }catch(error){
      const range=document.createRange();range.selectNodeContents(target);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
      button.textContent='Текст выделен';
    }
  }));
  window.setTimeout(()=>document.querySelectorAll('.toast.show').forEach(t=>bootstrap.Toast.getOrCreateInstance(t).hide()),4500);
});
