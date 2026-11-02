/**
 * 整张班表粘贴导入：辅助 UI，仅在用户确认后写入 QuickBoard 的现有表记录。
 * 数据格式与旧班表兼容：{columns:['姓名','11月1日',...],rows:[...],myName}
 */
(function(window, document){
'use strict';
function validDate(input) {
    const text = String(input || '').replace(/\s+/g,'');
    const m = text.match(/^(\d{1,2})月(\d{1,2})日?/) ||
        text.match(/^(\d{1,2})[\/.-](\d{1,2})(?:日)?$/);
    if (!m) return null;
    const month = Number(m[1]), day = Number(m[2]);
    if (month<1 || month>12 || day<1 || day>new Date(new Date().getFullYear(), month,0).getDate()) return null;
    return {month,day,label:month+'月'+day+'日'};
}
function readCells(raw) {
    const sep = raw.includes('\t') ? '\t' : ',';
    const source = raw.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
    const rows=[];
    let row=[], cell='', quoted=false;
    for(let i=0;i<source.length;i++){
        const ch=source[i];
        if(ch==='"'){
            if(quoted && source[i+1]==='"'){cell+='"';i++;}
            else quoted=!quoted;
        } else if(!quoted && (ch===sep||ch==='\n')){
            row.push(cell.trim());cell='';
            if(ch==='\n'){rows.push(row);row=[];}
        } else cell+=ch;
    }
    row.push(cell.trim());rows.push(row);
    return rows.filter(row=>row.some(cell=>cell.trim()));
}
function parse(raw) {
    if(!raw || !raw.trim())throw Error('请先粘贴复制的班表');
    if(raw.length>2000000)throw Error('粘贴内容过大，请只复制班表区域');
    const grid=readCells(raw);
    if(grid.length<2)throw Error('请复制含日期表头与人员班次的整块区域');
    let headerIdx=-1, dates=[];
    for(let i=0;i<Math.min(6,grid.length);i++){
        const found=grid[i].map((cell,index)=>({index,date:validDate(cell)})).filter(x=>x.date);
        if(found.length>dates.length){headerIdx=i;dates=found;}
    }
    if(dates.length<2)throw Error('未检测到足够的日期表头，例如 11月1日、11月2日');
    const months=[...new Set(dates.map(x=>x.date.month))];
    if(months.length!==1)throw Error('一次只能导入一个月份的班表');
    const month=months[0],seenDates=new Set();
    for(const item of dates){
        if(seenDates.has(item.date.label))throw Error('日期重复：'+item.date.label);
        seenDates.add(item.date.label);
    }
    const days=new Date(new Date().getFullYear(),month,0).getDate();
    const columns=['姓名',...Array.from({length:days},(_,i)=>month+'月'+(i+1)+'日')];
    const people=new Set(),rows=[];
    let shiftCount=0;
    for(let i=headerIdx+1;i<grid.length;i++){
        const rawRow=grid[i];
        const name=String(rawRow[0]||'').replace(/\s+/g,'').trim();
        if(!name || /^(姓名|人员|员工|排班需求|合计|统计|小计|班次|日期)$/.test(name))continue;
        if(/^(星期|周)[一二三四五六日天]/.test(name))continue;
        if(people.has(name))throw Error('姓名重复：'+name+'，请检查源表');
        const result=Array(columns.length).fill('');result[0]=name;
        for(const item of dates){
            const value=String(rawRow[item.index]||'').replace(/\s+/g,'').trim();
            if(value){result[item.date.day]=value;shiftCount++;}
        }
        if(result.slice(1).some(Boolean)){people.add(name);rows.push(result);}
    }
    if(!rows.length||!shiftCount)throw Error('没有识别到班次，请连同姓名和日期一起复制');
    return {month,days,dates:dates.length,shiftCount,columns,rows,skippedCols:dates[0].index-1};
}
function renderPreview(target,data){
    target.replaceChildren();
    const table=document.createElement('table'),head=document.createElement('thead'),tr=document.createElement('tr');
    for(const col of data.columns.slice(0,7)){
        const th=document.createElement('th');th.textContent=col;tr.append(th);
    }
    head.append(tr);table.append(head);
    const tbody=document.createElement('tbody');
    for(const row of data.rows.slice(0,7)){
        const line=document.createElement('tr');
        for(const val of row.slice(0,7)){
            const td=document.createElement('td');td.textContent=val;line.append(td);
        }
        tbody.append(line);
    }
    table.append(tbody);target.append(table);target.hidden=false;
}
function merge(table,data){
    const existing=table.columns.slice(1).filter(col=>validDate(col));
    if(existing.some(col=>validDate(col).month!==data.month))
        throw Error('原表月份不同，请使用「替换整张班表」，不要跨月合并');
    const map=new Map();
    for(const oldRow of table.rows){
        if(!oldRow[0])continue;
        const row=Array(data.columns.length).fill('');row[0]=oldRow[0];
        for(let i=1;i<data.columns.length;i++){
            const oldIndex=table.columns.indexOf(data.columns[i]);
            if(oldIndex>=0)row[i]=oldRow[oldIndex]||'';
        }
        map.set(row[0],row);
    }
    for(const incoming of data.rows){
        const row=map.get(incoming[0])||Array(data.columns.length).fill('');
        row[0]=incoming[0];
        for(let i=1;i<incoming.length;i++)if(incoming[i])row[i]=incoming[i];
        map.set(row[0],row);
    }
    return [...map.values()];
}
function open(table,db,onSaved){
    document.querySelectorAll('.qb-import-overlay').forEach(el=>el.remove());
    const overlay=document.createElement('div');
    overlay.className='qb-import-overlay';
    overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');
    overlay.setAttribute('aria-label','整张班表导入');
    overlay.innerHTML = [
        '<div class="qb-import-dialog">',
        '<div class="qb-import-head"><h2>📥 整张班表导入</h2><button type="button" class="qb-import-close" aria-label="关闭">×</button></div>',
        '<p class="qb-import-hint">在 Excel / 腾讯文档选中包括姓名、日期的整块班表，Ctrl+C 后粘贴。支持“排班需求”辅助列和星期表头；不足整月的日期会自动补为空列。</p>',
        '<textarea class="qb-import-raw" placeholder="姓名　排班需求　11月1日　11月2日　…"></textarea>',
        '<div class="qb-import-actions">',
        '<button type="button" class="qb-import-parse">识别并预览</button>',
        '<select class="qb-import-mode" aria-label="导入方式"><option value="replace">替换整张班表（新月份）</option><option value="merge">同月合并（非空单元格）</option></select>',
        '<button type="button" class="qb-import-submit qb-import-primary" disabled>确认导入</button>',
        '</div><div class="qb-import-status" role="status" aria-live="polite">先预览，再确认导入；不会自动覆盖旧数据。</div>',
        '<div class="qb-import-preview" hidden></div></div>'
    ].join('');
    document.body.append(overlay);
    const el=s=>overlay.querySelector(s);
    const raw=el('.qb-import-raw'),submit=el('.qb-import-submit'),preview=el('.qb-import-preview'),status=el('.qb-import-status');
    let result=null,busy=false;
    const feedback=(text,error=false)=>{status.textContent=text;status.classList.toggle('is-error',error);};
    const keyHandler=event=>{
        if(event.key==='Escape'){event.stopPropagation();close();}
    };
    function close(){
        if(busy)return;
        document.removeEventListener('keydown',keyHandler,true);
        overlay.remove();
    }
    document.addEventListener('keydown',keyHandler,true);
    el('.qb-import-close').addEventListener('click',close);
    overlay.addEventListener('click',event=>{if(event.target===overlay)close();});
    raw.addEventListener('input',()=>{result=null;submit.disabled=true;preview.hidden=true;});
    el('.qb-import-parse').addEventListener('click',()=>{
        try{
            result=parse(raw.value);
            renderPreview(preview,result);
            feedback('识别成功：'+result.month+'月 / '+result.rows.length+'人 / '+result.dates+'个日期 / '+result.shiftCount+'个班次单元格。已补齐当月'+result.days+'天，未复制的日期留空。');
            submit.disabled=false;
        }catch(error){result=null;submit.disabled=true;preview.hidden=true;feedback(error.message,true);}
    });
    submit.addEventListener('click',async()=>{
        if(!result||busy)return;
        const mode=el('.qb-import-mode').value;
        if(mode==='replace'&&table.rows.length&&
            !window.confirm('即将替换班表「'+table.name+'」的原有日期及全部班次。建议先导出旧 CSV 备份。确定继续？'))return;
        let rows;
        try{rows=mode==='merge'?merge(table,result):result.rows;}
        catch(error){feedback(error.message,true);return;}
        const myName=rows.some(r=>r[0]===table.myName)?table.myName:'';
        const updated={...table,columns:result.columns,rows,myName};
        busy=true;submit.disabled=true;
        try{
            await db.put(updated);
            table.columns=updated.columns;table.rows=updated.rows;table.myName=updated.myName;
            busy=false;close();onSaved(result);
        }catch(error){busy=false;submit.disabled=false;feedback('保存失败：'+error.message,true);}
    });
}
window.QuickBoardBulkImport={open,parse,merge};
})(window,document);
