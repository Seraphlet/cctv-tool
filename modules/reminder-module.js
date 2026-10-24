/**
 * reminder-module.js - 待办提醒模块（作为 cctv-tool 的一个独立标签）
 *
 * 接入方式：
 *   - 在 core.js 的 moduleRegistry 中注册 'reminder' -> reminder-module.js
 *   - 在 renderMainTabs() 增加 <span data-m="reminder">📋 待办提醒</span>
 *   - 在 init() 中预加载本模块（loadReminderModule），使提醒轮询在打开页面即常驻
 *
 * 模块契约：
 *   - init(container, App)   首次进入标签时调用，渲染 UI 到 container
 *   - activate(App)          再次进入标签时调用，重新渲染
 *   - 通过 App.EventBus 'tabChange' 维护 active 状态，避免在非本标签时改写共享容器
 */
(function(window) {
    'use strict';

    /* ---------- 状态常量 ---------- */
    const STATUS = { PENDING: 'pending', REMINDED: 'reminded', COMPLETED: 'completed', MISSED: 'missed' };
    const STATUS_LABEL = { pending: '待提醒', reminded: '已提醒', completed: '已完成', missed: '已错过' };
    const REPEAT_LABEL = { once: '仅一次', daily: '每天', weekday: '工作日' };

    /* ---------- IndexedDB 封装（Promise 风格） ---------- */
    class ReminderDB {
        constructor(dbName = 'ReminderDB', store = 'tasks') {
            this.dbName = dbName; this.store = store; this.db = null;
        }
        open() {
            return new Promise((resolve, reject) => {
                const req = indexedDB.open(this.dbName, 1);
                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(this.store)) {
                        db.createObjectStore(this.store, { keyPath: 'id', autoIncrement: true });
                    }
                };
                req.onsuccess = (e) => { this.db = e.target.result; resolve(this.db); };
                req.onerror = (e) => reject(e.target.error);
            });
        }
        _store(mode) { return this.db.transaction(this.store, mode).objectStore(this.store); }
        getAll() {
            return new Promise((resolve, reject) => {
                const req = this._store('readonly').getAll();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => reject(req.error);
            });
        }
        add(task) {
            return new Promise((resolve, reject) => {
                const req = this._store('readwrite').add(task);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        }
        put(task) {
            return new Promise((resolve, reject) => {
                const req = this._store('readwrite').put(task);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        }
        delete(id) {
            return new Promise((resolve, reject) => {
                const req = this._store('readwrite').delete(id);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        }
    }

    /* ---------- 工具 ---------- */
    const pad = (n) => String(n).padStart(2, '0');
    const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    function taskDateTime(task) {
        const parts = task.time.split(':').map(Number);
        const d = new Date(task.date + 'T00:00:00');
        d.setHours(parts[0] || 0, parts[1] || 0, 0, 0);
        return d;
    }
    function advanceRepeat(task) {
        const d = new Date(task.date + 'T00:00:00');
        d.setDate(d.getDate() + 1);
        if (task.repeat === 'weekday') {
            while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
        }
        task.date = toDateStr(d);
        task.status = STATUS.PENDING;
    }
    function relativeTime(dt) {
        const diff = dt.getTime() - Date.now();
        const abs = Math.abs(diff);
        let txt;
        const min = Math.round(abs / 60000);
        if (min < 1) txt = '片刻';
        else if (min < 60) txt = `${min} 分钟`;
        else if (min < 1440) txt = `${Math.round(min / 60)} 小时`;
        else txt = `${Math.round(min / 1440)} 天`;
        return diff >= 0 ? `还有 ${txt}` : `已逾期 ${txt}`;
    }

    /* ---------- 模块对象 ---------- */
    const module = {
        name: 'reminder',
        db: null,
        tasks: [],
        filter: 'all',
        tagFilter: '',
        editingId: null,
        active: false,
        started: false,
        subscribed: false,
        pollTimer: null,
        container: null,
        toastRoot: null,
        modal: null,
        f: {}, // 模态框字段引用

        /* ===== 生命周期 ===== */
        init(container, App) {
            this.App = App;
            this.container = container;
            this.active = (App.state.currM === 'reminder');
            this._ensureDom();
            this._bindEvents();
            if (!this.subscribed) { this._subscribe(); this.subscribed = true; }
            this._start();
            if (this.active) this.render();
        },

        // 启动预加载（页面初始化时调用，无需容器）：建立数据库与轮询，使提醒常驻
        _start(App) {
            if (App) this.App = App;
            this._ensureDom();
            if (this.started) return;
            this.started = true;
            this.openDB().then(() => {
                this.checkReminders();
                this.pollTimer = setInterval(() => this.checkReminders(), 30000);
            });
        },

        activate(App) {
            this.App = App;
            this.active = (App.state.currM === 'reminder');
            if (this.active) this.render();
        },

        async openDB() {
            try {
                await this.db.open();
                this.tasks = await this.db.getAll();
            } catch (e) {
                console.error('ReminderDB 初始化失败：', e);
            }
        },

        _subscribe() {
            this.App.EventBus.on('tabChange', (name) => {
                this.active = (name === 'reminder');
                if (this.active && this.started) this.render();
            });
        },

        /* ===== 创建常驻 DOM（模态框 + Toast 容器，挂在 body 上以免被其它模块覆盖） ===== */
        _ensureDom() {
            if (this.toastRoot && document.body.contains(this.toastRoot)) return;

            // Toast 容器
            const toast = document.createElement('div');
            toast.id = 'rmToastRoot';
            toast.className = 'rm-toast-container';
            document.body.appendChild(toast);
            this.toastRoot = toast;

            // 模态框
            const modal = document.createElement('div');
            modal.id = 'rmModal';
            modal.className = 'rm-modal';
            modal.style.display = 'none';
            modal.innerHTML = `
                <div class="rm-modal-content">
                    <h2 id="rmModalTitle">新增待办</h2>
                    <form id="rmForm">
                        <label class="rm-field"><span>事项标题 *</span>
                            <input type="text" id="rmTitle" required maxlength="100" placeholder="例如：提交周报"></label>
                        <label class="rm-field"><span>详细描述（可选）</span>
                            <textarea id="rmDesc" rows="3" maxlength="500" placeholder="补充说明…"></textarea></label>
                        <div class="rm-field-row">
                            <label class="rm-field"><span>提醒日期</span><input type="date" id="rmDate" required></label>
                            <label class="rm-field"><span>提醒时间</span><input type="time" id="rmTime" required></label>
                        </div>
                        <div class="rm-field-row">
                            <label class="rm-field"><span>重复</span>
                                <select id="rmRepeat"><option value="once">仅一次</option><option value="daily">每天</option><option value="weekday">工作日</option></select></label>
                            <label class="rm-field"><span>提前提醒</span>
                                <select id="rmAdvance"><option value="0">到点即时</option><option value="5">提前 5 分钟</option><option value="10">提前 10 分钟</option></select></label>
                        </div>
                        <label class="rm-field"><span>标签 / 分类（可选）</span>
                            <input type="text" id="rmTag" maxlength="20" placeholder="如：工作 / 生活"></label>
                        <label class="rm-field rm-resident-field">
                            <span class="rm-check-inline">
                                <input type="checkbox" id="rmResident">
                                <span>常驻提醒（长期保留，不计入「全部」，仅在「📌 常驻」中查看，但会照常主动弹通知）</span>
                            </span>
                        </label>
                        <div class="rm-modal-actions">
                            <button type="button" id="rmCancel" class="rm-btn rm-ghost">取消</button>
                            <button type="submit" class="rm-btn rm-primary">保存</button>
                        </div>
                    </form>
                </div>`;
            document.body.appendChild(modal);
            this.modal = modal;
            this.f = {
                title: modal.querySelector('#rmTitle'),
                desc: modal.querySelector('#rmDesc'),
                date: modal.querySelector('#rmDate'),
                time: modal.querySelector('#rmTime'),
                repeat: modal.querySelector('#rmRepeat'),
                advance: modal.querySelector('#rmAdvance'),
                tag: modal.querySelector('#rmTag'),
                resident: modal.querySelector('#rmResident'),
                form: modal.querySelector('#rmForm'),
                titleEl: modal.querySelector('#rmModalTitle'),
            };
        },

        _bindEvents() {
            const con = this.container;
            // 卡片操作 + 工具栏（事件委托，render 重建后仍有效）
            con.addEventListener('click', (e) => this._onContainerClick(e));
            con.addEventListener('change', (e) => {
                if (e.target.id === 'rmTagFilter') { this.tagFilter = e.target.value; this.render(); }
            });
            con.addEventListener('submit', (e) => {
                if (e.target.id === 'rmForm') { e.preventDefault(); this._onFormSubmit(); }
            });
            // 模态框
            this.f.form.addEventListener('submit', (e) => { e.preventDefault(); this._onFormSubmit(); });
            this.modal.querySelector('#rmCancel').addEventListener('click', () => this._closeModal());
            this.modal.addEventListener('click', (e) => { if (e.target === this.modal) this._closeModal(); });
        },

        _onContainerClick(e) {
            const filterBtn = e.target.closest('.rm-filter');
            if (filterBtn) {
                this.filter = filterBtn.dataset.filter;
                this.render();
                return;
            }
            const actBtn = e.target.closest('[data-act]');
            if (actBtn) {
                const card = actBtn.closest('.rm-card');
                const id = Number(card.dataset.id);
                const act = actBtn.dataset.act;
                if (act === 'edit') this._openModal(this.tasks.find(t => t.id === id));
                else if (act === 'delete') this._deleteTask(id);
                else if (act === 'complete') this._setStatus(id, STATUS.COMPLETED);
                else if (act === 'restore') this._setStatus(id, STATUS.PENDING);
                else if (act === 'reschedule') this._rescheduleMenu(id, actBtn);
                return;
            }
            if (e.target.closest('#rmAddBtn')) this._openModal(null);
            else if (e.target.closest('#rmClearBtn')) this._clearCompleted();
            else if (e.target.closest('#rmNotifBtn')) this._requestNotif();
            else if (e.target.closest('#rmExportBtn')) this._export();
            else if (e.target.closest('#rmImportBtn')) this.fImport && this.fImport.click();
        },

        /* ===== 渲染 ===== */
        render() {
            if (!this.active || !this.container) return; // 非本标签时不改写共享容器
            const con = this.container;
            con.innerHTML = '';

            // 工具栏
            const toolbar = document.createElement('div');
            toolbar.className = 'rm-toolbar';
            toolbar.innerHTML = `
                <button id="rmAddBtn" class="rm-btn rm-primary">+ 新增待办</button>
                <div class="rm-filters">
                    <button class="rm-filter ${this.filter === 'all' ? 'active' : ''}" data-filter="all">全部</button>
                    <button class="rm-filter ${this.filter === 'pending' ? 'active' : ''}" data-filter="pending">待提醒</button>
                    <button class="rm-filter ${this.filter === 'reminded' ? 'active' : ''}" data-filter="reminded">已提醒</button>
                    <button class="rm-filter ${this.filter === 'completed' ? 'active' : ''}" data-filter="completed">已完成</button>
                    <button class="rm-filter ${this.filter === 'missed' ? 'active' : ''}" data-filter="missed">已错过</button>
                    <button class="rm-filter rm-filter-resident ${this.filter === 'resident' ? 'active' : ''}" data-filter="resident">📌 常驻</button>
                </div>
                <select id="rmTagFilter" class="rm-tag-filter" title="按标签筛选"><option value="">全部标签</option></select>
                <div class="rm-tools">
                    <button id="rmNotifBtn" class="rm-btn rm-ghost">🔔 通知</button>
                    <button id="rmExportBtn" class="rm-btn rm-ghost">⬇️ 导出</button>
                    <button id="rmImportBtn" class="rm-btn rm-ghost">⬆️ 导入</button>
                    <button id="rmClearBtn" class="rm-btn rm-ghost rm-danger-text">清空已完成</button>
                </div>`;
            con.appendChild(toolbar);

            // 标签筛选选项
            const tags = [...new Set(this.tasks.map(t => t.tag).filter(Boolean))].sort();
            const tagSel = toolbar.querySelector('#rmTagFilter');
            tags.forEach(t => {
                const o = document.createElement('option');
                o.value = t; o.textContent = '#' + t;
                if (t === this.tagFilter) o.selected = true;
                tagSel.appendChild(o);
            });

            // 隐藏的文件输入（导入用）
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'application/json';
            fileInput.id = 'rmImportInput';
            fileInput.style.display = 'none';
            fileInput.addEventListener('change', (ev) => { if (ev.target.files[0]) this._import(ev.target.files[0]); });
            con.appendChild(fileInput);
            this.fImport = fileInput;

            // 列表
            const list = this._visibleTasks();
            if (list.length === 0) {
                const empty = document.createElement('p');
                empty.className = 'rm-empty';
                empty.textContent = '暂无待办，点击「新增待办」开始吧 🚀';
                con.appendChild(empty);
                return;
            }
            const listEl = document.createElement('div');
            listEl.className = 'rm-list';
            listEl.innerHTML = list.map(t => this._cardHtml(t)).join('');
            con.appendChild(listEl);
        },

        _visibleTasks() {
            let list = this.tasks.slice();
            if (this.filter === 'resident') {
                list = list.filter(t => t.resident);
            } else {
                // 「全部」及状态筛选中隐藏常驻项，避免干扰
                list = list.filter(t => !t.resident);
                if (this.filter !== 'all') list = list.filter(t => t.status === this.filter);
            }
            if (this.tagFilter) list = list.filter(t => t.tag === this.tagFilter);
            list.sort((a, b) => taskDateTime(a) - taskDateTime(b));
            return list;
        },

        _cardHtml(task) {
            const dt = taskDateTime(task);
            const desc = task.description ? `<p class="rm-card-desc">${escapeHtml(task.description)}</p>` : '';
            const tag = task.tag ? `<span class="rm-tag">#${escapeHtml(task.tag)}</span>` : '';
            const residentBadge = task.resident ? `<span class="rm-resident-badge">📌 常驻</span>` : '';
            const completeBtn = task.status === STATUS.COMPLETED
                ? `<button class="rm-card-btn" data-act="restore">恢复</button>`
                : `<button class="rm-card-btn" data-act="complete">完成</button>`;
            return `
                <article class="rm-card status-${task.status}${task.resident ? ' resident' : ''}" data-id="${task.id}">
                    <div class="rm-card-head">
                        <h3 class="rm-card-title">${escapeHtml(task.title)}</h3>
                        <span class="rm-badge badge-${task.status}">${STATUS_LABEL[task.status]}</span>
                    </div>
                    ${desc}
                    <div class="rm-card-meta">
                        <span>📅 ${task.date} ${task.time}</span>
                        <span>🔁 ${REPEAT_LABEL[task.repeat]}</span>
                        ${tag}
                        ${residentBadge}
                    </div>
                    <div class="rm-card-time">${relativeTime(dt)}</div>
                    <div class="rm-card-actions">
                        ${completeBtn}
                        <button class="rm-card-btn" data-act="reschedule">改期</button>
                        <button class="rm-card-btn" data-act="edit">编辑</button>
                        <button class="rm-card-btn rm-danger" data-act="delete">删除</button>
                    </div>
                </article>`;
        },

        /* ===== 模态框 ===== */
        _openModal(task) {
            this.editingId = task ? task.id : null;
            this.f.titleEl.textContent = task ? '编辑待办' : '新增待办';
            if (task) {
                this.f.title.value = task.title;
                this.f.desc.value = task.description || '';
                this.f.date.value = task.date;
                this.f.time.value = task.time;
                this.f.repeat.value = task.repeat;
                this.f.advance.value = String(task.advance);
                this.f.tag.value = task.tag || '';
                this.f.resident.checked = !!task.resident;
            } else {
                const d = new Date(Date.now() + 3600000);
                this.f.date.value = toDateStr(d);
                this.f.time.value = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
                this.f.repeat.value = 'once';
                this.f.advance.value = '0';
                this.f.tag.value = '';
                this.f.desc.value = '';
                this.f.title.value = '';
                this.f.resident.checked = false;
            }
            this.modal.style.display = 'flex';
            this.f.title.focus();
        },
        _closeModal() { this.modal.style.display = 'none'; this.editingId = null; },

        async _onFormSubmit() {
            if ('Notification' in window && Notification.permission === 'default') {
                Notification.requestPermission().then(() => this._updateNotifUI());
            }
            const payload = {
                title: this.f.title.value.trim(),
                description: this.f.desc.value.trim(),
                date: this.f.date.value,
                time: this.f.time.value,
                repeat: this.f.repeat.value,
                advance: Number(this.f.advance.value),
                tag: this.f.tag.value.trim(),
                resident: this.f.resident.checked,
                status: STATUS.PENDING,
            };
            if (!payload.title) { this._showToast('⚠️ 提示', '请填写事项标题'); return; }
            if (this.editingId != null) {
                payload.id = this.editingId;
                await this.db.put(payload);
                const idx = this.tasks.findIndex(t => t.id === this.editingId);
                if (idx > -1) this.tasks[idx] = payload;
            } else {
                const id = await this.db.add(payload);
                payload.id = id;
                this.tasks.push(payload);
            }
            this._closeModal();
            this.render();
        },

        /* ===== 数据操作 ===== */
        async _deleteTask(id) {
            const t = this.tasks.find(x => x.id === id);
            if (t && !confirm(`确定删除「${t.title}」？`)) return;
            await this.db.delete(id);
            this.tasks = this.tasks.filter(x => x.id !== id);
            this.render();
        },
        async _setStatus(id, status) {
            const t = this.tasks.find(x => x.id === id);
            if (!t) return;
            t.status = status;
            await this.db.put(t);
            this.render();
        },

        /* ===== 改期 / 延期菜单 ===== */
        _rescheduleMenu(id, anchorEl) {
            const old = document.getElementById('rmReschedMenu');
            if (old) old.remove();
            const t = this.tasks.find(x => x.id === id);
            if (!t) return;

            const menu = document.createElement('div');
            menu.id = 'rmReschedMenu';
            menu.className = 'rm-menu';
            const r = anchorEl.getBoundingClientRect();
            menu.style.left = r.left + 'px';
            menu.style.top = (r.bottom + 6) + 'px';
            menu.innerHTML = `
                <div class="rm-menu-item" data-days="1">延期 1 天</div>
                <div class="rm-menu-item" data-days="3">延期 3 天</div>
                <div class="rm-menu-item" data-days="7">延期 7 天</div>
                <div class="rm-menu-item" data-days="14">延期 14 天</div>
                <div class="rm-menu-divider"></div>
                <div class="rm-menu-item" data-custom="1">🗓️ 自定义日期…</div>`;
            document.body.appendChild(menu);

            const applyNewDate = (newDateStr) => {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(newDateStr)) {
                    this._showToast('⚠️ 提示', '日期格式应为 YYYY-MM-DD');
                    return;
                }
                t.date = newDateStr;
                t.status = STATUS.PENDING;
                this.db.put(t).then(() => this.render());
            };

            menu.addEventListener('click', (ev) => {
                const item = ev.target.closest('.rm-menu-item');
                if (!item) return;
                menu.remove();
                if (item.dataset.custom) {
                    const input = prompt('请输入新的提醒日期（格式 YYYY-MM-DD）：', t.date);
                    if (input) applyNewDate(input.trim());
                } else {
                    const days = Number(item.dataset.days);
                    const d = new Date(t.date + 'T00:00:00');
                    d.setDate(d.getDate() + days);
                    applyNewDate(toDateStr(d));
                }
            });

            const close = (ev) => {
                if (!menu.contains(ev.target)) {
                    menu.remove();
                    document.removeEventListener('click', close);
                }
            };
            setTimeout(() => document.addEventListener('click', close), 0);
        },
        async _clearCompleted() {
            const done = this.tasks.filter(t => t.status === STATUS.COMPLETED && !t.resident);
            if (done.length === 0) { this._showToast('⚠️ 提示', '没有可删除的已完成任务（常驻项不会被清空）'); return; }
            if (!confirm(`确定删除 ${done.length} 条已完成任务？`)) return;
            for (const t of done) await this.db.delete(t.id);
            this.tasks = this.tasks.filter(t => t.status !== STATUS.COMPLETED || t.resident);
            this.render();
        },

        /* ===== 提醒机制 ===== */
        fireReminder(task) {
            const body = task.description ? task.description : `提醒时间：${task.date} ${task.time}`;
            if ('Notification' in window && Notification.permission === 'granted') {
                try { new Notification('⏰ ' + task.title, { body }); } catch (_) {}
            }
            this._showToast(task.title, body);
        },

        async checkReminders() {
            const now = new Date();
            let changed = false;
            for (const task of this.tasks) {
                if (task.status === STATUS.COMPLETED || task.status === STATUS.REMINDED) continue;
                // 常驻提醒同样主动弹通知（不再跳过）
                const dt = taskDateTime(task);
                const trigger = new Date(dt.getTime() - (task.advance || 0) * 60000);
                if (now < trigger) continue;
                if (now >= dt) {
                    if (task.repeat === 'once' && task.advance > 0) {
                        if (task.status !== STATUS.MISSED) { task.status = STATUS.MISSED; changed = true; }
                        await this.db.put(task);
                    } else {
                        this.fireReminder(task);
                        if (task.repeat === 'once') task.status = STATUS.REMINDED;
                        else advanceRepeat(task);
                        await this.db.put(task);
                        changed = true;
                    }
                } else {
                    this.fireReminder(task);
                    if (task.repeat === 'once') task.status = STATUS.REMINDED;
                    else advanceRepeat(task);
                    await this.db.put(task);
                    changed = true;
                }
            }
            if (changed && this.active) this.render();
        },

        _showToast(title, body) {
            const el = document.createElement('div');
            el.className = 'rm-toast';
            el.innerHTML = `<div class="rm-toast-title">⏰ ${escapeHtml(title)}</div><div class="rm-toast-body">${escapeHtml(body)}</div>`;
            this.toastRoot.appendChild(el);
            setTimeout(() => {
                el.classList.add('rm-leaving');
                el.addEventListener('animationend', () => el.remove(), { once: true });
            }, 5000);
        },

        /* ===== 通知 ===== */
        _updateNotifUI() {
            const btn = this.container && this.container.querySelector('#rmNotifBtn');
            if (!btn) return;
            const p = ('Notification' in window) ? Notification.permission : 'default';
            btn.textContent = p === 'granted' ? '🔔 已开启' : (p === 'denied' ? '🔕 被拒绝' : '🔔 通知');
        },
        async _requestNotif() {
            if (!('Notification' in window)) { this._showToast('⚠️ 提示', '当前浏览器不支持系统通知'); return; }
            try { const p = await Notification.requestPermission(); this._updateNotifUI(); } catch (_) {}
        },

        /* ===== 导出 / 导入 ===== */
        async _export() {
            const data = await this.db.getAll();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `reminder-backup-${toDateStr(new Date())}.json`;
            a.click(); URL.revokeObjectURL(url);
        },
        async _import(file) {
            const text = await file.text();
            let arr;
            try { arr = JSON.parse(text); } catch (_) { this._showToast('❌ 错误', '导入失败：文件不是合法 JSON'); return; }
            if (!Array.isArray(arr)) { this._showToast('❌ 错误', '导入失败：格式不正确'); return; }
            for (const item of arr) {
                if (!item || !item.title || !item.date || !item.time) continue;
                const { id, ...rest } = item;
                await this.db.add({
                    title: rest.title, description: rest.description || '',
                    date: rest.date, time: rest.time,
                    repeat: rest.repeat || 'once', advance: Number(rest.advance) || 0,
                    tag: rest.tag || '', resident: Boolean(rest.resident), status: STATUS.PENDING,
                });
            }
            this.tasks = await this.db.getAll();
            this.render();
            this._showToast('✅ 成功', `导入成功，共 ${arr.length} 条`);
        },
    };

    module.db = new ReminderDB();

    window.__modules = window.__modules || {};
    window.__modules['reminder'] = module;
})(window);
