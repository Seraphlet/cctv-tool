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
function readCells(raw, preserveBlankRows=false) {
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
    // 最后一个换行是复制内容的行终止符；保留中间空白行。
    if(source.endsWith('\n'))rows.pop();
    return preserveBlankRows ? rows : rows.filter(row=>row.some(cell=>cell.trim()));
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

/**
 * 精确导入：分开粘贴姓名列 Index、日期行 Columns、班次矩阵 Data。
 * 行内空值保持原位，行尾补空；不猜测缺少的整行。
 */
function parseStructured(indexText, columnsText, dataText) {
    if (!indexText || !indexText.trim()) throw Error('请先粘贴 Index（姓名列）');
    if (!columnsText || !columnsText.trim()) throw Error('请先粘贴 Columns（日期行）');
    if (!dataText) throw Error('请粘贴完整 Data 区域（含空白员工行）');
    if ([indexText, columnsText, dataText].some(t=>t.length > 2000000))
        throw Error('复制内容过大，请缩小选区');

    const nameGrid=readCells(indexText,true);
    if (!nameGrid.length) throw Error('Index 中没有人员');
    const names=nameGrid.map((row,i)=>{
        if(row.length!==1) throw Error('Index 第 '+(i+1)+' 行不是单列，请只复制姓名列');
        const name=row[0].trim();
        if(!name) throw Error('Index 第 '+(i+1)+' 行姓名为空，请核对原表范围');
        return name;
    });
    if(new Set(names).size!==names.length) throw Error('Index 存在重复姓名');

    const dateGrid=readCells(columnsText,true);
    if(dateGrid.length!==1) throw Error('Columns 应只复制一整行日期');
    const header=dateGrid[0];
    if(!header.length || header.some(v=>!v.trim()))throw Error('Columns 包含空列，请完整复制日期行');
    const parsedDates=header.map((s,i)=>{
        const date=validDate(s);
        if(!date)throw Error('Columns 第 '+(i+1)+' 列无法识别日期：'+s);
        return date;
    });
    const months=[...new Set(parsedDates.map(x=>x.month))];
    if(months.length!==1)throw Error('Columns 包含多个不同月份，请分月导入');
    const month=months[0];
    if(new Set(parsedDates.map(d=>d.label)).size!==parsedDates.length)
        throw Error('Columns 含重复日期，请核对');
    const grid=readCells(dataText,true);
    if(grid.length!==names.length)
        throw Error('Data 行数不匹配：Index '+names.length+' 人，Data '+grid.length+
            ' 行。请确保复制区域包含完整空行，不能自动补缺失的整行');
    const width=parsedDates.length;
    const days=new Date(new Date().getFullYear(),month,0).getDate();
    const columns=['姓名',...Array.from({length:days},(_,i)=>month+'月'+(i+1)+'日')];
    let shiftCount=0,padded=0,emptyPeople=0;
    const rows=grid.map((dataRow,i)=>{
        if(dataRow.length>width)
            throw Error('Data 第 '+(i+1)+' 行有 '+dataRow.length+
                ' 列，超出 Columns 的 '+width+' 列，请检查辅助列');
        const next=Array(columns.length).fill('');
        next[0]=names[i];
        padded+=width-dataRow.length;
        let hasValue=false;
        for(let j=0;j<width;j++){
            const value=String(dataRow[j]??'').trim();
            next[parsedDates[j].day]=value;
            if(value){hasValue=true;shiftCount++;}
        }
        if(!hasValue)emptyPeople++;
        return next;
    });
    return {source:'structured',month,days,dates:width,shiftCount,columns,rows,
        inputRows:names.length,inputColumns:width,padded,emptyPeople,
        previewDays:parsedDates.map(x=>x.day)};
}

function renderPreview(target,data){
    target.replaceChildren();
    const table=document.createElement('table'),head=document.createElement('thead'),tr=document.createElement('tr');
    const indexes=data.source==='structured' ? [0,...data.previewDays.slice(0,6)]
        : Array.from({length:Math.min(7,data.columns.length)},(_,i)=>i);
    for(const idx of indexes){
        const th=document.createElement('th');th.textContent=data.columns[idx];tr.append(th);
    }
    head.append(tr);table.append(head);
    const tbody=document.createElement('tbody');
    for(const row of data.rows.slice(0,7)){
        const line=document.createElement('tr');
        for(const idx of indexes){
            const td=document.createElement('td');td.textContent=row[idx]||'';line.append(td);
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
        '<div class="qb-import-tabs">',
        '<button type="button" class="qb-import-tab is-active" data-import-tab="auto" aria-pressed="true">整块粘贴</button>',
        '<button type="button" class="qb-import-tab" data-import-tab="structured" aria-pressed="false">Index / Columns / Data 精确导入</button>',
        '</div>',
        '<div class="qb-import-auto">',
        '<p class="qb-import-hint">从 Excel / 腾讯文档复制含姓名与日期的完整班表，支持常见辅助列和星期表头。</p>',
        '<textarea class="qb-import-raw" placeholder="姓名　排班需求　11月1日　11月2日　…"></textarea>',
        '</div>',
        '<div class="qb-import-structured" hidden>',
        '<p class="qb-import-hint">分别复制：①姓名列 ②日期行 ③班次矩形。允许空班次；行尾补空，但整行缺失会报错。请保留所有人员位置。</p>',
        '<label for="qb-import-index">① Index · 姓名（竖向，每行一人）</label>',
        '<textarea id="qb-import-index" class="qb-import-index" placeholder="张三&#10;李四&#10;王五"></textarea>',
        '<label for="qb-import-columns">② Columns · 日期（横向，一整行）</label>',
        '<textarea id="qb-import-columns" class="qb-import-columns" placeholder="11月1日&#9;11月2日&#9;11月3日"></textarea>',
        '<label for="qb-import-data">③ Data · 班次（对应矩形，不含姓名/表头）</label>',
        '<textarea id="qb-import-data" class="qb-import-data" placeholder="早班&#9;小夜&#9;&#10;&#9;休&#9;小夜&#10;休&#9;&#9;早班"></textarea>',
        '</div>',
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
    let result=null,busy=false,importType='auto';
    const feedback=(text,error=false)=>{status.textContent=text;status.classList.toggle('is-error',error);};
    const invalidate=()=>{
        result=null;submit.disabled=true;preview.hidden=true;
        feedback('识别并预览后才能确认导入，不会自动覆盖旧数据。');
    };
    overlay.querySelectorAll('.qb-import-tab').forEach(button=>{
        button.addEventListener('click',()=>{
            importType=button.dataset.importTab;
            overlay.querySelectorAll('.qb-import-tab').forEach(tab=>{
                const active=tab===button;
                tab.classList.toggle('is-active',active);
                tab.setAttribute('aria-pressed',String(active));
            });
            el('.qb-import-auto').hidden=importType!=='auto';
            el('.qb-import-structured').hidden=importType!=='structured';
            invalidate();
        });
    });
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
    [raw,el('.qb-import-index'),el('.qb-import-columns'),el('.qb-import-data')]
        .forEach(field=>field.addEventListener('input',invalidate));
    el('.qb-import-parse').addEventListener('click',()=>{
        try{
            result=importType==='structured'
                ? parseStructured(el('.qb-import-index').value,el('.qb-import-columns').value,el('.qb-import-data').value)
                : parse(raw.value);
            renderPreview(preview,result);
            const suffix=result.source==='structured'
                ? '；行尾补空 '+result.padded+' 格，整行空班次 '+result.emptyPeople+' 人'
                : '';
            feedback('识别成功：'+result.month+'月 / '+result.rows.length+'人 / '+result.dates+'个日期 / '+result.shiftCount+'个班次单元格'+suffix+'。已补齐当月'+result.days+'天，未复制的日期留空。');
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
window.QuickBoardBulkImport={open,parse,parseStructured,merge};
})(window,document);
