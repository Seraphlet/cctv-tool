/**
 * quickboard-module.js - 速查表模块（增强版）
 * 
 * 新增优化：
 *   - 频道节目表支持多时段自动拆分（如 10:00/11:00 → 两条记录）
 *   - 同一时间段的节目自动相邻展示，按时间排序
 *   - 修复当前时间高亮不生效的问题
 *   - 班表功能保持不变
 *   - 列数 > 10 时隐藏多输入框，改为粘贴添加
 *   - 复制班表文本：支持“显示全部”或“根据当前时间”两种模式
 *   - 文本格式：日期+班次换行，人名用顿号分隔
 *   - 支持匹配包含“早班”或“小夜”的班次名称（如“早班1”、“小夜班3”）
 */
(function(window) {
    'use strict';

    // ========== IndexedDB 存储 ==========
    class QuickDB {
        constructor() {
            this.dbName = 'QuickBoardDB';
            this.storeName = 'tables';
            this.db = null;
        }
        async open() {
            return new Promise((resolve, reject) => {
                const req = indexedDB.open(this.dbName, 1);
                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(this.storeName)) {
                        db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
                    }
                };
                req.onsuccess = (e) => { this.db = e.target.result; resolve(); };
                req.onerror = () => reject(req.error);
            });
        }
        async getAll() {
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(this.storeName, 'readonly');
                const store = tx.objectStore(this.storeName);
                const req = store.getAll();
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        }
        async put(table) {
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(this.storeName, 'readwrite');
                const store = tx.objectStore(this.storeName);
                const req = store.put(table);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        }
        async delete(id) {
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(this.storeName, 'readwrite');
                const store = tx.objectStore(this.storeName);
                const req = store.delete(id);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        }
    }

    // ========== 默认数据 ==========
    const DEFAULT_TABLES = [
        {
            id: 1,
            name: '频道节目表',
            type: 'normal',
            columns: ['频道', '栏目', '开始时间', '结束时间'],
            rows: [
                ['CCTV1(综合频道)', '新闻30分', '12:00', '12:30'],
                ['CCTV1(综合频道)', '今日说法', '12:30', '13:10'],
                ['CCTV1(综合频道)', '新闻联播', '19:00', '19:30'],
                ['CCTV1(综合频道)', '焦点访谈', '19:30', '20:00'],
                ['CCTV1(综合频道)', '晚间新闻', '22:00', '22:30'],
                ['CCTV13(新闻频道)', '朝闻天下', '6:00', '9:00'],
                ['CCTV13(新闻频道)', '东方时空', '20:00', '21:00'],
                ['CCTV13(新闻频道)', '共同关注', '18:00', '19:00'],
                ['CCTV13(新闻频道)', '新闻直播间', '13:00', '16:00'],
                ['CCTV13(新闻频道)', '新闻直播间', '16:00', '17:00'],
                ['CCTV13(新闻频道)', '新闻直播间', '17:00', '18:00'],
                ['CCTV13(新闻频道)', '新闻直播间', '9:00', '12:00'],
                ['CCTV13(新闻频道)', '法治在线', '12:33', '13:00'],
                ['CCTV13(新闻频道)', '新闻1+1', '21:30', '22:00'],
                ['CCTV13(新闻频道)', '新闻调查', '21:30', '22:15'],
                ['CCTV2(财经频道)', '经济半小时', '20:00', '20:30'],
                ['CCTV2(财经频道)', '正点财经', '10:00/11:00/15:00/16:00/17:00', '10:30/11:30/15:30/17:00/17:30'],
                ['CCTV2(财经频道)', '天下财经', '12:00', '13:00'],
                ['CCTV2(财经频道)', '消费主张', '19:30', '20:00'],
                ['CCTV2(财经频道)', '第一时间', '7:00', '9:00'],
                ['CCTV2(财经频道)', '经济信息联播', '20:30', '21:30'],
                ['CCTV12(社会与法)', '热线12', '18:20', '18:50'],
                ['CCTV2(财经频道)', '财经调查', '20:00', '20:30'],
                ['CCTV2(财经频道)', '对话', '21:30', '22:15'],
            ]
        },
        {
            id: 2,
            name: '班表',
            type: 'schedule',
            columns: ['姓名'],
            rows: [],
            myName: ''
        },
        {
            id: 3,
            name: '常用语句',
            type: 'normal',
            columns: ['场景', '语句'],
            rows: []
        }
    ];

    // ========== 模块主体 ==========
    const module = {
        name: 'quickboard',
        db: null,
        tables: [],
        activeTableId: 1,
        scheduleMode: 'current', // 'all' 或 'current'
        progReminder: true,          // 节目开播前 5 分钟提醒（默认开）
        _remindedSet: null,          // 当天已提醒过的节目 key 集合
        _remindDay: '',              // 当前提醒所针对的日期（跨天重置）
        _remindTimer: null,          // 全局轮询定时器
        _toastContainer: null,       // body 级 Toast 容器

        async init(container, App) {
            this.App = App;
            this.container = container;
            this.db = new QuickDB();
            await this.db.open();
            this.tables = await this.db.getAll();

            if (this.tables.length === 0) {
                for (const tpl of DEFAULT_TABLES) await this.db.put(tpl);
                this.tables = DEFAULT_TABLES;
            } else {
                for (const tpl of DEFAULT_TABLES) {
                    if (!this.tables.find(t => t.id === tpl.id)) {
                        await this.db.put(tpl);
                        this.tables.push(tpl);
                    }
                }
            }
            this.render();

            // 节目开播提醒：加载开关状态并启动全局轮询（默认开启）
            try { this.progReminder = localStorage.getItem('qb_prog_reminder') !== '0'; } catch (e) { this.progReminder = true; }
            this._remindedSet = new Set();
            this._remindDay = this._getTodayString();
            this._ensureToast();
            if (!this._remindTimer) {
                this._remindTimer = setInterval(() => this._checkProgReminders(), 15000);
                this._checkProgReminders();
            }
        },

        activate(App) { this.App = App; this.render(); },
        destroy() { if (this.container) this.container.innerHTML = ''; },

        /* ========== 节目开播提醒（提前 5 分钟） ========== */
        // 注入 Toast 容器与样式（仅一次）
        _ensureToast() {
            if (!this._toastContainer) {
                let c = document.getElementById('qb-toast-container');
                if (!c) {
                    c = document.createElement('div');
                    c.id = 'qb-toast-container';
                    document.body.appendChild(c);
                }
                this._toastContainer = c;
            }
            if (!document.getElementById('qb-reminder-style')) {
                const s = document.createElement('style');
                s.id = 'qb-reminder-style';
                s.textContent = `
.qb-reminder-bar { display:flex; align-items:center; gap:12px; margin:8px 0 10px; flex-wrap:wrap; }
.qb-switch { display:inline-flex; align-items:center; gap:6px; font-size:13px; color:#1f2329; cursor:pointer; }
.qb-switch input { width:16px; height:16px; accent-color:#1677ff; cursor:pointer; }
.qb-notif-btn { padding:4px 10px; border:1px solid #d0d3d9; background:#fff; border-radius:6px; font-size:12px; cursor:pointer; color:#646a73; transition:all .15s; }
.qb-notif-btn:hover { border-color:#1677ff; color:#1677ff; }
#qb-toast-container { position:fixed; right:20px; bottom:20px; z-index:9999; display:flex; flex-direction:column; gap:10px; max-width:320px; }
.qb-toast { background:#fff; border-left:4px solid #1677ff; border-radius:10px; box-shadow:0 6px 24px rgba(0,0,0,.18); padding:12px 14px; animation:qb-toast-in .25s ease; }
.qb-toast-title { font-weight:600; font-size:14px; margin-bottom:2px; color:#1f2329; }
.qb-toast-body { font-size:13px; color:#646a73; word-break:break-word; }
.qb-toast.qb-leaving { animation:qb-toast-out .3s ease forwards; }
@keyframes qb-toast-in { from { opacity:0; transform:translateX(30px); } to { opacity:1; transform:translateX(0); } }
@keyframes qb-toast-out { to { opacity:0; transform:translateX(30px); } }
`;
                document.head.appendChild(s);
            }
        },

        // 申请系统通知权限（用户手势触发）
        requestNotif() {
            if (!('Notification' in window)) { this._showToast('⚠️ 提示', '当前浏览器不支持系统通知'); return; }
            try {
                Notification.requestPermission().then(() => this._updateNotifBtn());
            } catch (e) {
                // 兼容旧版回调式 API
                Notification.requestPermission(() => this._updateNotifBtn());
            }
        },

        _updateNotifBtn() {
            const btn = document.getElementById('progNotifBtn');
            if (!btn) return;
            const map = { granted: '🔔 通知已开启', denied: '🔕 通知被拒绝', default: '🔔 开启系统通知' };
            btn.textContent = map[Notification.permission] || '🔔 开启系统通知';
        },

        // 触发一次提醒：系统通知（若已授权）+ 页面 Toast
        _fireProgReminder(title, body) {
            if ('Notification' in window && Notification.permission === 'granted') {
                try { new Notification(title, { body }); } catch (e) { /* 忽略 */ }
            }
            this._showToast(title, body);
        },

        _showToast(title, body) {
            this._ensureToast();
            const el = document.createElement('div');
            el.className = 'qb-toast';
            el.innerHTML = `<div class="qb-toast-title">${this._escapeHtml(title)}</div><div class="qb-toast-body">${this._escapeHtml(body)}</div>`;
            this._toastContainer.appendChild(el);
            setTimeout(() => {
                el.classList.add('qb-leaving');
                el.addEventListener('animationend', () => el.remove(), { once: true });
            }, 6000);
        },

        // 每 15 秒轮询：对含开始/结束时间的表，开播前 5 分钟提醒一次
        _checkProgReminders() {
            if (!this.progReminder) return;
            if (!this._remindedSet) { this._remindedSet = new Set(); this._remindDay = this._getTodayString(); }
            const today = this._getTodayString();
            if (today !== this._remindDay) { this._remindDay = today; this._remindedSet.clear(); }

            const now = new Date();
            const nowMin = now.getHours() * 60 + now.getMinutes();

            for (const table of this.tables) {
                const cols = table.columns || [];
                if (!cols.includes('开始时间') || !cols.includes('结束时间')) continue;
                const expanded = this._expandScheduleRows(table);
                for (const item of expanded) {
                    if (item.startMin == null) continue;
                    const triggerMin = item.startMin - 5;           // 提前 5 分钟
                    if (nowMin >= triggerMin && nowMin < item.startMin) {
                        const key = `${table.id}|${item.channel}|${item.column}|${item.startStr}`;
                        if (this._remindedSet.has(key)) continue;   // 当天只提醒一次
                        this._remindedSet.add(key);
                        this._fireProgReminder(`📺 即将开播：${item.column}`, `${item.channel} · ${item.startStr}`);
                    }
                }
            }
        },

        /* ========== 工具函数 ========== */

        /* ========== 工具函数 ========== */
        _escapeHtml(text) { return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); },
        _timeToMinutes(str) {
            if (!str || str.trim() === '') return null;
            const first = str.split('/')[0].trim();
            const parts = first.split(':');
            if (parts.length === 2) {
                return parseInt(parts[0]) * 60 + parseInt(parts[1]);
            }
            return null;
        },
        _getTodayString() { const now = new Date(); return `${now.getMonth()+1}月${now.getDate()}日`; },
        _isDateString(str) { return /^\d{1,2}月\d{1,2}日$/.test(str.trim()); },

        /**
         * 将频道节目表的行拆分多时段为多条记录，并排序
         * 返回对象数组：{ rowIdx, channel, column, startStr, endStr, startMin, endMin }
         */
        _expandScheduleRows(table) {
            if (!table.columns.includes('开始时间') || !table.columns.includes('结束时间')) {
                return table.rows.map((row, idx) => ({
                    rowIdx: idx,
                    channel: row[0] || '',
                    column: row[1] || '',
                    startStr: row[2] || '',
                    endStr: row[3] || '',
                    startMin: this._timeToMinutes(row[2]),
                    endMin: this._timeToMinutes(row[3])
                }));
            }

            const startCol = table.columns.indexOf('开始时间');
            const endCol = table.columns.indexOf('结束时间');
            const channelCol = table.columns.indexOf('频道');
            const columnCol = table.columns.indexOf('栏目');

            const expanded = [];
            table.rows.forEach((row, rowIdx) => {
                const channel = row[channelCol] || '';
                const column = row[columnCol] || '';
                const startRaw = row[startCol] || '';
                const endRaw = row[endCol] || '';

                const startParts = startRaw.split('/').map(s => s.trim()).filter(Boolean);
                const endParts = endRaw.split('/').map(s => s.trim()).filter(Boolean);
                while (endParts.length < startParts.length) endParts.push('');

                startParts.forEach((startStr, i) => {
                    const endStr = endParts[i] || '';
                    const startMin = this._timeToMinutes(startStr);
                    const endMin = this._timeToMinutes(endStr);
                    expanded.push({
                        rowIdx,
                        channel,
                        column,
                        startStr,
                        endStr,
                        startMin,
                        endMin
                    });
                });
            });

            expanded.sort((a, b) => {
                if (a.startMin === null && b.startMin === null) return 0;
                if (a.startMin === null) return 1;
                if (b.startMin === null) return -1;
                return a.startMin - b.startMin;
            });

            return expanded;
        },

        // ========== 渲染 ==========
        render() {
            const con = this.container;
            const table = this.tables.find(t => t.id === this.activeTableId) || this.tables[0];
            if (!table) { con.innerHTML = '<p>暂无数据</p>'; return; }

            const isSchedule = table.type === 'schedule';
            const today = this._getTodayString();
            let todayColIdx = -1;
            if (isSchedule && table.columns.length > 1) {
                todayColIdx = table.columns.findIndex(col => col === today);
            }

            let expandedRows = null;
            if (!isSchedule && table.columns.includes('开始时间') && table.columns.includes('结束时间')) {
                expandedRows = this._expandScheduleRows(table);
            }

            const now = new Date();
            const currentMinutes = now.getHours() * 60 + now.getMinutes();

            let headerHtml = '';
            let rowsHtml = '';

            if (isSchedule) {
                headerHtml = table.columns.map((col, idx) => {
                    const isTodayCol = (idx === todayColIdx);
                    return `<th style="padding:6px;border:1px solid #ddd;${isTodayCol ? 'background:#ffeb3b;' : ''}">${this._escapeHtml(col)}</th>`;
                }).join('');

                rowsHtml = '';
                table.rows.forEach((row, rowIdx) => {
                    const isMe = (table.myName && row[0] === table.myName);
                    let rowStyle = '';
                    if (isMe) rowStyle += 'background:#e6f7ff;';

                    let myShift = '';
                    if (todayColIdx !== -1 && table.myName) {
                        const myRow = table.rows.find(r => r[0] === table.myName);
                        if (myRow && myRow[todayColIdx]) myShift = myRow[todayColIdx].trim();
                    }

                    const cells = row.map((cell, colIdx) => {
                        let cellStyle = '';
                        if (colIdx === todayColIdx) cellStyle += 'background:#fff9c4;';
                        if (todayColIdx !== -1 && colIdx === todayColIdx && !isMe) {
                            const thisShift = (cell || '').trim();
                            if (thisShift !== '' && myShift !== '' && thisShift === myShift) {
                                cellStyle += 'background:#c8e6c9;';
                            }
                        }
                        if (isMe) {
                            if (colIdx === 0) cellStyle += 'font-weight:bold;';
                            if (colIdx === todayColIdx) cellStyle += 'font-weight:bold;';
                        }
                        return `<td style="padding:6px;border:1px solid #ddd;${cellStyle}">${this._escapeHtml(cell)}</td>`;
                    }).join('');
                    const delBtn = `<td><button class="del-row-btn" data-row="${rowIdx}">×</button></td>`;
                    rowsHtml += `<tr style="${rowStyle}">${cells}${delBtn}</tr>`;
                });
            } else if (expandedRows) {
                headerHtml = table.columns.map(col => `<th style="padding:6px;border:1px solid #ddd;">${this._escapeHtml(col)}</th>`).join('');

                const renderedSet = new Set();
                expandedRows.forEach((item, index) => {
                    const isCurrent =
                        item.startMin !== null && item.endMin !== null &&
                        currentMinutes >= item.startMin && currentMinutes < item.endMin;
                    const rowStyle = isCurrent ? 'background:#fffbe6;' : '';

                    const cells = [
                        item.channel,
                        item.column,
                        item.startStr,
                        item.endStr
                    ].map(cell => `<td style="padding:6px;border:1px solid #ddd;">${this._escapeHtml(cell)}</td>`).join('');

                    let delBtn = '';
                    if (!renderedSet.has(item.rowIdx)) {
                        delBtn = `<td rowspan="1"><button class="del-row-btn" data-row="${item.rowIdx}">×</button></td>`;
                        renderedSet.add(item.rowIdx);
                    }

                    rowsHtml += `<tr style="${rowStyle}">${cells}${delBtn}</tr>`;
                });
            } else {
                headerHtml = table.columns.map(col => `<th style="padding:6px;border:1px solid #ddd;">${this._escapeHtml(col)}</th>`).join('');
                rowsHtml = table.rows.map((row, rowIdx) => {
                    const cells = row.map(cell => `<td style="padding:6px;border:1px solid #ddd;">${this._escapeHtml(cell)}</td>`).join('');
                    const delBtn = `<td><button class="del-row-btn" data-row="${rowIdx}">×</button></td>`;
                    return `<tr>${cells}${delBtn}</tr>`;
                }).join('');
            }

            // 班表控制栏（新增模式选择）
            let scheduleControls = '';
            if (isSchedule) {
                const names = [...new Set(table.rows.map(r => r[0]).filter(Boolean))];
                const nameOptions = names.map(n => `<option value="${n}" ${table.myName === n ? 'selected' : ''}>${n}</option>`).join('');
                scheduleControls = `
                    <div style="margin-bottom:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                        <label>👤 我：</label>
                        <select id="myNameSelect" style="padding:4px;border:1px solid #ddd;border-radius:4px;">
                            <option value="">-- 选择姓名 --</option>
                            ${nameOptions}
                        </select>
                        <label>📋 显示模式：</label>
                        <select id="scheduleModeSelect" style="padding:4px;border:1px solid #ddd;border-radius:4px;">
                            <option value="all" ${this.scheduleMode === 'all' ? 'selected' : ''}>显示全部</option>
                            <option value="current" ${this.scheduleMode === 'current' ? 'selected' : ''}>根据当前时间</option>
                        </select>
                        <button id="importHeaderBtn" class="btn btn-light">📅 导入表头（日期）</button>
                        <button id="importRowBtn" class="btn btn-light">👤 导入行（班次）</button>
                        <button id="copyScheduleBtn" class="btn btn-light">📋 复制班表文本</button>
                        <span style="font-size:11px;color:#888;">可单独粘贴一行日期或一行人员班次</span>
                    </div>
                `;
            }

            const showMultiInput = !isSchedule && (!expandedRows || table.columns.length <= 10);
            let addRowHtml = '';
            if (showMultiInput) {
                addRowHtml = `
                    <div style="margin-top:10px;display:flex;gap:6px;">
                        ${table.columns.map((col, idx) => `
                            <input type="text" id="newCell_${idx}" placeholder="${col}" style="flex:1;padding:4px;border:1px solid #ddd;border-radius:4px;">
                        `).join('')}
                        <button id="addRowBtn" class="btn btn-primary">添加行</button>
                    </div>
                `;
            } else if (!isSchedule) {
                addRowHtml = `
                    <div style="margin-top:10px;">
                        <button id="manualAddRowBtn" class="btn btn-primary">➕ 手动添加一行（粘贴）</button>
                    </div>
                `;
            }

            // 节目开播提醒开关栏（仅“频道节目表”这类含开始/结束时间的表显示）
            let reminderBarHtml = '';
            if (!isSchedule && expandedRows) {
                const notifLabel = ('Notification' in window)
                    ? ({ granted: '🔔 通知已开启', denied: '🔕 通知被拒绝', default: '🔔 开启系统通知' })[Notification.permission] || '🔔 开启系统通知'
                    : '🔔 浏览器不支持';
                reminderBarHtml = `
                    <div class="qb-reminder-bar">
                        <label class="qb-switch">
                            <input type="checkbox" id="progReminderToggle" ${this.progReminder ? 'checked' : ''}>
                            <span>🔔 节目开播前 5 分钟提醒</span>
                        </label>
                        <button id="progNotifBtn" class="qb-notif-btn">${notifLabel}</button>
                    </div>
                `;
            }

            let toolbarHtml = '';
            if (!isSchedule) {
                toolbarHtml += `<button id="editColumnsBtn" class="btn btn-light">✎ 编辑列</button>`;
            }
            toolbarHtml += `<button id="clearDataBtn" class="btn btn-warning">🗑️ 清空数据</button>`;
            toolbarHtml += `<button id="deleteTableBtn" class="btn btn-danger">❌ 删除当前表</button>`;
            toolbarHtml += `<button id="exportCSVBtn" class="btn btn-light">📥 导出CSV</button>`;

            con.innerHTML = `
                <div style="padding:10px;">
                    <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;">
                        ${this.tables.map(t => `
                            <button class="btn ${t.id === this.activeTableId ? 'btn-primary' : 'btn-light'}" id="tabBtn_${t.id}">${t.name}${t.type==='schedule'?' 📅':''}</button>
                        `).join('')}
                        <button class="btn btn-light" id="addTableBtn">➕ 新建普通表</button>
                    </div>
                    ${scheduleControls}${reminderBarHtml}
                    <div style="overflow-x:auto;">
                        <table style="width:100%;border-collapse:collapse;">
                            <thead><tr style="background:#f5f5f5;">${headerHtml}<th style="padding:6px;border:1px solid #ddd;">操作</th></tr></thead>
                            <tbody>${rowsHtml}</tbody>
                        </table>
                    </div>
                    <div style="overflow-x:auto;">${addRowHtml}</div>
                    <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap;">
                        ${toolbarHtml}
                    </div>
                </div>
            `;

            this._bindEvents(table, isSchedule);
        },

        _bindEvents(table, isSchedule) {
            // 切换表
            this.tables.forEach(t => {
                const btn = document.getElementById(`tabBtn_${t.id}`);
                if (btn) btn.addEventListener('click', () => { this.activeTableId = t.id; this.render(); });
            });

            // 新建普通表
            document.getElementById('addTableBtn').addEventListener('click', () => {
                const name = prompt('请输入表名：');
                if (name) {
                    const newTable = { id: Date.now(), name, type: 'normal', columns: ['字段1'], rows: [] };
                    this.tables.push(newTable);
                    this.db.put(newTable);
                    this.activeTableId = newTable.id;
                    this.render();
                }
            });

            // 清空数据
            document.getElementById('clearDataBtn').addEventListener('click', async () => {
                if (!confirm(`确定清空表"${table.name}"的所有数据吗？此操作只删除行数据，保留列结构！`)) return;
                table.rows = [];
                await this.db.put(table);
                this.render();
            });

            // 删除当前表
            document.getElementById('deleteTableBtn').addEventListener('click', async () => {
                if (!confirm(`⚠️ 即将永久删除整个表"${table.name}"及所有数据！\n如果只想清空内容，请使用"清空数据"按钮。`)) return;
                if (!confirm(`再次确认：删除表"${table.name}"？此操作无法撤销！`)) return;
                await this.db.delete(table.id);
                this.tables = this.tables.filter(t => t.id !== table.id);
                this.activeTableId = this.tables[0]?.id || 0;
                this.render();
            });

            // 导出CSV
            document.getElementById('exportCSVBtn').addEventListener('click', () => {
                const csvContent = [table.columns.join(',')].concat(
                    table.rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
                ).join('\n');
                const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${table.name}.csv`;
                a.click();
                URL.revokeObjectURL(url);
            });

            // 编辑列（普通表）
            const editColsBtn = document.getElementById('editColumnsBtn');
            if (editColsBtn) {
                editColsBtn.addEventListener('click', () => {
                    const cols = prompt('请输入列名（用逗号分隔）：', table.columns.join(','));
                    if (cols) {
                        table.columns = cols.split(',').map(c => c.trim()).filter(Boolean);
                        table.rows = table.rows.map(row => {
                            const newRow = table.columns.map((_, i) => row[i] || '');
                            return newRow;
                        });
                        this.db.put(table);
                        this.render();
                    }
                });
            }

            // 添加行（列数≤10时存在）
            const addRowBtn = document.getElementById('addRowBtn');
            if (addRowBtn) {
                addRowBtn.addEventListener('click', async () => {
                    const newRow = table.columns.map((_, idx) => document.getElementById(`newCell_${idx}`)?.value || '');
                    table.rows.push(newRow);
                    await this.db.put(table);
                    this.render();
                });
            }

            // 手动粘贴添加行（列数>10）
            const manualAddBtn = document.getElementById('manualAddRowBtn');
            if (manualAddBtn) {
                manualAddBtn.addEventListener('click', () => {
                    const raw = prompt('请粘贴一行数据（用 Tab 键或逗号分隔）：');
                    if (!raw) return;
                    const parts = raw.split(/\t|,/).map(s => s.trim());
                    if (parts.length === 0) { this._showToast('⚠️ 提示', '未识别到数据'); return; }
                    while (parts.length > table.columns.length) {
                        table.columns.push(`字段${table.columns.length + 1}`);
                        table.rows.forEach(row => row.push(''));
                    }
                    const newRow = [...parts];
                    while (newRow.length < table.columns.length) newRow.push('');
                    table.rows.push(newRow);
                    this.db.put(table);
                    this.render();
                });
            }

            // 删除行
            document.querySelectorAll('.del-row-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const rowIdx = parseInt(btn.dataset.row);
                    if (isNaN(rowIdx)) return;
                    table.rows.splice(rowIdx, 1);
                    await this.db.put(table);
                    this.render();
                });
            });

            // 节目开播提醒：开关 + 通知权限按钮
            const progToggle = document.getElementById('progReminderToggle');
            if (progToggle) {
                progToggle.addEventListener('change', () => {
                    this.progReminder = progToggle.checked;
                    try { localStorage.setItem('qb_prog_reminder', this.progReminder ? '1' : '0'); } catch (e) {}
                    // 开启时若尚未授权，借用户手势申请通知权限
                    if (this.progReminder && 'Notification' in window && Notification.permission === 'default') {
                        Notification.requestPermission().then(() => this._updateNotifBtn());
                    }
                });
            }
            const progNotifBtn = document.getElementById('progNotifBtn');
            if (progNotifBtn) {
                progNotifBtn.addEventListener('click', () => this.requestNotif());
            }

            // 班表特有控制
            if (isSchedule) {
                const selectEl = document.getElementById('myNameSelect');
                if (selectEl) {
                    selectEl.addEventListener('change', async () => {
                        table.myName = selectEl.value;
                        await this.db.put(table);
                        this.render();
                    });
                }

                // 模式切换
                const modeSelect = document.getElementById('scheduleModeSelect');
                if (modeSelect) {
                    modeSelect.addEventListener('change', () => {
                        this.scheduleMode = modeSelect.value;
                        // 不重新渲染，仅保存状态
                    });
                }

                document.getElementById('importHeaderBtn')?.addEventListener('click', () => {
                    const raw = prompt('请粘贴一行日期（例如：7月1日\t7月2日\t...），将替换当前表头（保留姓名列）');
                    if (!raw) return;
                    const parts = raw.split(/\t|,/).map(s => s.trim()).filter(Boolean);
                    if (parts.length === 0) { this._showToast('⚠️ 提示', '未识别到日期'); return; }
                    if (!parts.every(p => this._isDateString(p))) {
                        if (!confirm('部分列名看起来不像日期格式（如"7月1日"），是否强制替换？')) return;
                    }
                    table.columns = ['姓名', ...parts];
                    const newColCount = table.columns.length;
                    table.rows = table.rows.map(row => {
                        const newRow = table.columns.map((_, i) => row[i] || '');
                        return newRow;
                    });
                    this.db.put(table);
                    this.render();
                });

                document.getElementById('importRowBtn')?.addEventListener('click', () => {
                    const raw = prompt('请粘贴一行人员班次（例如：杨展鹏\t早班1\t早班1\t...）');
                    if (!raw) return;
                    const parts = raw.split(/\t|,/).map(s => s.trim());
                    if (parts.length === 0) { this._showToast('⚠️ 提示', '未识别到数据'); return; }
                    if (parts.length > table.columns.length) {
                        const extraCount = parts.length - table.columns.length;
                        for (let i = 0; i < extraCount; i++) {
                            table.columns.push(`字段${table.columns.length + 1}`);
                        }
                        table.rows = table.rows.map(row => {
                            while (row.length < table.columns.length) row.push('');
                            return row;
                        });
                    }
                    const newRow = [...parts];
                    while (newRow.length < table.columns.length) newRow.push('');
                    table.rows.push(newRow);
                    this.db.put(table);
                    this.render();
                });

                // ====== 复制班表文本（增强版，支持“早班1”、“小夜班3”等变体） ======
                const copyBtn = document.getElementById('copyScheduleBtn');
                if (copyBtn) {
                    copyBtn.addEventListener('click', () => {
                        const today = this._getTodayString();
                        const colIdx = table.columns.indexOf(today);
                        if (colIdx === -1) {
                            this._showToast('⚠️ 提示', `未找到今日日期 "${today}" 的列，请确保表头包含该日期。`);
                            return;
                        }

                        // 收集各班次人员，使用关键词归类
                        const shiftGroups = {
                            '早班': [],
                            '小夜': []
                        };
                        // 同时保留其他未归类的班次（如果存在）
                        const otherShifts = {};

                        table.rows.forEach(row => {
                            if (!row[0]) return;
                            const shift = (row[colIdx] || '').trim();
                            if (!shift) return;
                            // 判断关键词
                            if (shift.includes('早班')) {
                                shiftGroups['早班'].push(row[0]);
                            } else if (shift.includes('小夜')) {
                                shiftGroups['小夜'].push(row[0]);
                            } else {
                                // 其他班次，按原样归类
                                if (!otherShifts[shift]) otherShifts[shift] = [];
                                otherShifts[shift].push(row[0]);
                            }
                        });

                        // 合并：先预设早班、小夜，再加入其他
                        const allGroups = {};
                        // 只添加非空组
                        if (shiftGroups['早班'].length) allGroups['早班'] = shiftGroups['早班'];
                        if (shiftGroups['小夜'].length) allGroups['小夜'] = shiftGroups['小夜'];
                        // 其他组
                        Object.keys(otherShifts).forEach(key => {
                            if (otherShifts[key].length) allGroups[key] = otherShifts[key];
                        });

                        const mode = this.scheduleMode; // 'all' 或 'current'
                        const now = new Date();
                        const hour = now.getHours();
                        const isMorning = hour < 12;

                        let lines = [];
                        let showShifts = [];

                        if (mode === 'all') {
                            showShifts = Object.keys(allGroups);
                        } else {
                            // 根据当前时间：早班（12点前）或小夜（12点后）
                            const target = isMorning ? '早班' : '小夜';
                            // 优先匹配预设关键词
                            let matchedKey = Object.keys(allGroups).find(k => k.includes(target) || target.includes(k));
                            if (matchedKey) {
                                showShifts = [matchedKey];
                            } else {
                                // 如果没有匹配，则显示全部（降级）
                                showShifts = Object.keys(allGroups);
                            }
                        }

                        // 生成文本
                        showShifts.forEach(shift => {
                            const people = allGroups[shift] || [];
                            if (people.length === 0) return;
                           // -------- 修改点：统一显示为“早班”或“小夜” --------
                           let displayName = shift;
                           if (displayName.includes('早班')) displayName = '早班';
                           else if (displayName.includes('小夜')) displayName = '小夜';
                           // 如果都不包含，保留原样
                          // -------------------------------------------------
                          lines.push(`${today}${displayName}值班：`);
                          lines.push(people.join('、'));
                          lines.push(''); // 空行分隔
                        });

                        if (lines.length === 0) {
                            this._showToast('⚠️ 提示', '今日无任何班次数据');
                            return;
                        }

                        // 去掉末尾多余空行
                        while (lines.length > 0 && lines[lines.length-1] === '') lines.pop();
                        const text = lines.join('\n');

                        navigator.clipboard.writeText(text).then(() => {
                            this._showToast('✅ 成功', '已复制到剪贴板');
                        }).catch(() => {
                            // 降级方案：提示手动复制（多行文本，用全局 message 保留换行）
                            message(`复制失败，请手动复制以下内容：\n\n${text}`, 'error');
                        });
                    });
                }
            }
        }
    };

    window.__modules = window.__modules || {};
    window.__modules['quickboard'] = module;
})(window);