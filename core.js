/**
 * core.js - 央视舆情模块化生成器核心脚本
 * 
 * 功能：
 * - 模块注册与动态加载
 * - 标签顺序：日常 → 全套监测 → 自定义模板 → 内容拼接 → 文本阅读 → 新闻搜索
 * - 右下角随手记悬浮按钮：自动保存、ESC关闭、全屏切换
 * - 右下角图片暂存板悬浮按钮（位于随手记正上方）：粘贴图片、点击缩略图全屏遮罩放大查看（点击任意位置关闭）、面板不关闭、ESC关闭、全屏切换
 */
(function(window, document) {
    'use strict';

    const STORAGE_PREFIX = 'cmswrap_';

    // ========== 事件总线 ==========
    class EventBusClass {
        constructor() { this._events = {}; }
        on(name, fn) {
            (this._events[name] = this._events[name] || []).push(fn);
            return () => this.off(name, fn);
        }
        off(name, fn) {
            if (!this._events[name]) return;
            this._events[name] = this._events[name].filter(f => f !== fn);
        }
        emit(name, data) {
            (this._events[name] || []).forEach(fn => { try { fn(data); } catch (e) { console.error(e); } });
        }
    }

    // ========== 工具 API ==========
    const API = {
        escapeHtml(t) { return t ? t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : ''; },
        applyHighlight(t) {
            let s = this.escapeHtml(t);
            s = s.replace(/\\@@/g,'@@');
            return s.replace(/@@(.+?)@@/g,'<span class="highlight">$1</span>');
        },
        stripHighlight(t) {
            return t ? t.replace(/@@(.+?)@@/g,'$1').replace(/\\@@/g,'@@') : '';
        },
        getCurrentDateStr() {
            const n = new Date();
            return n.getFullYear() + String(n.getMonth()+1).padStart(2,'0') + String(n.getDate()).padStart(2,'0');
        },
        copyText(s) {
            if (!s) { message('没有内容可复制', 'warning'); return; }
            navigator.clipboard.writeText(this.stripHighlight(s)).then(() => message('复制成功', 'success')).catch(() => {
                const ta = document.createElement('textarea');
                ta.value = this.stripHighlight(s);
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                message('复制成功', 'success');
            });
        },
        storageGet(k) {
            try { const v = localStorage.getItem(STORAGE_PREFIX + k); return v ? JSON.parse(v) : null; }
            catch(e) { return null; }
        },
        storageSet(k, v) {
            try { localStorage.setItem(STORAGE_PREFIX + k, JSON.stringify(v)); } catch(e) {}
        },
        storageRemove(k) {
            try { localStorage.removeItem(STORAGE_PREFIX + k); } catch(e) {}
        }
    };

    // ========== 全局 Message 反馈（替代原生 alert：顶部居中浮层，非阻塞，自动消失） ==========
    // 用法：message('复制成功', 'success')，type 支持 success / error / warning / info（缺省 info）
    const MSG_BOX_ID = 'cmswrapMsgBox';
    const MSG_STYLE_ID = 'cmswrapMsgStyle';
    const MSG_TYPES = {
        success: { icon: '✅', color: '#52c41a' },
        error:   { icon: '❌', color: '#ff4d4f' },
        warning: { icon: '⚠️', color: '#faad14' },
        info:    { icon: 'ℹ️', color: '#1677ff' }
    };
    function message(text, type) {
        try {
            if (!document.getElementById(MSG_STYLE_ID)) {
                const st = document.createElement('style');
                st.id = MSG_STYLE_ID;
                st.textContent = [
                    '#' + MSG_BOX_ID + '{position:fixed;top:24px;left:50%;transform:translateX(-50%);z-index:2147483000;display:flex;flex-direction:column;align-items:center;gap:10px;pointer-events:none;}',
                    '.cmswrap-msg{max-width:560px;background:#fff;border:1px solid #f0f0f0;border-left:4px solid #1677ff;border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.14);padding:10px 16px;font-size:14px;line-height:1.6;color:#1f2329;display:flex;align-items:flex-start;gap:8px;pointer-events:auto;word-break:break-word;white-space:pre-wrap;animation:cmswrap-msg-in .22s ease;}',
                    '.cmswrap-msg.cmswrap-msg-out{animation:cmswrap-msg-out .22s ease forwards;}',
                    '@keyframes cmswrap-msg-in{from{opacity:0;transform:translateY(-14px);}to{opacity:1;transform:translateY(0);}}',
                    '@keyframes cmswrap-msg-out{to{opacity:0;transform:translateY(-14px);}}'
                ].join('');
                document.head.appendChild(st);
            }
            let box = document.getElementById(MSG_BOX_ID);
            if (!box) {
                box = document.createElement('div');
                box.id = MSG_BOX_ID;
                document.body.appendChild(box);
            }
            const conf = MSG_TYPES[type] || MSG_TYPES.info;
            const el = document.createElement('div');
            el.className = 'cmswrap-msg';
            el.style.borderLeftColor = conf.color;
            el.innerHTML = '<span>' + conf.icon + '</span><span>' +
                API.escapeHtml(text == null ? '' : String(text)) + '</span>';
            box.appendChild(el);
            setTimeout(() => {
                el.classList.add('cmswrap-msg-out');
                setTimeout(() => el.remove(), 240);
            }, 2600);
        } catch (e) {
            console.error('[message]', e);
        }
    }
    window.message = message;

    // ========== 全局状态 ==========
    const state = {
        currM: 'richang',
        currS: 'yuqing',
        editMode: false,
        customTemplates: [],
        activeTemplateData: null,
        lineList: []
    };

    // ========== 模块注册表 ==========
    const moduleRegistry = {
        'richang':  { file: 'yuqing-module.js', loaded: false, instance: null },
        'quantao':  { file: 'yuqing-module.js', loaded: false, instance: null },
        'pingjie':  { file: 'pingjie-module.js', loaded: false, instance: null },
        'reader':   { file: 'reader-module.js', loaded: false, instance: null },
        'build':    { file: 'builder-module.js', loaded: false, instance: null },
        'news':     { file: 'news-module.js', loaded: false, instance: null },
        'quickboard': { file: 'quickboard-module.js', loaded: false, instance: null },
        'extract':  { file: 'extract-module.js', loaded: false, instance: null },
        'reminder': { file: 'reminder-module.js', loaded: false, instance: null }
    };

    // ========== 自定义模板管理 ==========
    function loadCustomTemplates() {
        state.customTemplates = API.storageGet('user_templates') || [];
        state.customTemplates.forEach(tpl => {
            if (!moduleRegistry[tpl.id]) {
                moduleRegistry[tpl.id] = {
                    file: 'yuqing-module.js',
                    loaded: false,
                    instance: null,
                    mode: 'custom',
                    templateData: tpl
                };
            }
        });
    }

    function refreshCustomTemplates() {
        loadCustomTemplates();
        renderMainTabs();
    }

    function addCustomTemplate(tpl) {
        const exists = state.customTemplates.findIndex(t => t.id === tpl.id);
        if (exists >= 0) {
            state.customTemplates[exists] = tpl;
        } else {
            state.customTemplates.push(tpl);
        }
        API.storageSet('user_templates', state.customTemplates);
        refreshCustomTemplates();
    }

    function removeCustomTemplate(id) {
        state.customTemplates = state.customTemplates.filter(t => t.id !== id);
        API.storageSet('user_templates', state.customTemplates);
        delete moduleRegistry[id];
        if (state.currM === id) {
            state.currM = 'richang';
            state.activeTemplateData = null;
        }
        refreshCustomTemplates();
        renderModule();
    }

    function renameCustomTemplate(id, newName) {
        const tpl = state.customTemplates.find(t => t.id === id);
        if (tpl) {
            tpl.name = newName;
            tpl.updatedAt = new Date().toISOString();
            API.storageSet('user_templates', state.customTemplates);
            refreshCustomTemplates();
        }
    }

    function duplicateCustomTemplate(id) {
        const tpl = state.customTemplates.find(t => t.id === id);
        if (tpl) {
            const newTpl = JSON.parse(JSON.stringify(tpl));
            newTpl.id = 'tpl_' + Date.now();
            newTpl.name = tpl.name + ' (副本)';
            newTpl.createdAt = new Date().toISOString();
            newTpl.updatedAt = new Date().toISOString();
            addCustomTemplate(newTpl);
        }
    }

    // ========== 主标签栏渲染 ==========
    function renderMainTabs() {
        const tabsContainer = document.getElementById('mainTabs');
        if (!tabsContainer) return;

        let html = `<span data-m="richang" class="${state.currM === 'richang' ? 'active' : ''}">日常</span>
                    <span data-m="quantao" class="${state.currM === 'quantao' ? 'active' : ''}">全套监测</span>`;

        state.customTemplates.forEach(tpl => {
            html += `<span data-m="${tpl.id}" class="${state.currM === tpl.id ? 'active' : ''} custom-tab" title="${API.escapeHtml(tpl.name)}">📄 ${API.escapeHtml(tpl.name)}</span>`;
        });

        html += `<span data-m="extract" class="${state.currM === 'extract' ? 'active' : ''}">📋 解析</span>
                 <span data-m="pingjie" class="${state.currM === 'pingjie' ? 'active' : ''}">📝 内容拼接</span>
                 <span data-m="reader" class="${state.currM === 'reader' ? 'active' : ''}">📖 文本阅读</span>
                 <span data-m="news" class="${state.currM === 'news' ? 'active' : ''}">📰 新闻搜索</span>
                 <span data-m="quickboard" class="${state.currM === 'quickboard' ? 'active' : ''}">📋 速查表</span>
                 <span data-m="reminder" class="${state.currM === 'reminder' ? 'active' : ''}">📋 待办提醒</span>`;

        tabsContainer.innerHTML = html;
        bindTabEvents(tabsContainer);
    }

    function bindTabEvents(container) {
        container.querySelectorAll('span').forEach(el => {
            el.addEventListener('click', function() {
                document.querySelectorAll('#mainTabs span').forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                state.currM = this.dataset.m;
                state.activeTemplateData = state.customTemplates.find(t => t.id === state.currM) || null;
                App.EventBus.emit('tabChange', state.currM);
                renderModule();
            });

            if (el.classList.contains('custom-tab')) {
                el.addEventListener('contextmenu', function(e) {
                    e.preventDefault();
                    showTabContextMenu(e.clientX, e.clientY, this.dataset.m);
                });
            }
        });
    }

    function showTabContextMenu(x, y, tabId) {
        const oldMenu = document.getElementById('tabContextMenu');
        if (oldMenu) oldMenu.remove();

        const menu = document.createElement('div');
        menu.id = 'tabContextMenu';
        menu.style.cssText = `position:fixed;left:${x}px;top:${y}px;background:#fff;border:1px solid #ccc;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:2000;min-width:140px;padding:4px 0;`;
        menu.innerHTML = `
            <div class="menu-item" data-action="rename">✏️ 重命名</div>
            <div class="menu-item" data-action="duplicate">📋 复制模板</div>
            <div class="menu-item" data-action="export">📥 导出模板</div>
            <div class="menu-divider"></div>
            <div class="menu-item menu-danger" data-action="delete">🗑️ 删除模板</div>`;

        menu.addEventListener('click', async (e) => {
            const action = e.target.dataset.action;
            menu.remove();

            if (action === 'rename') {
                const tpl = state.customTemplates.find(t => t.id === tabId);
                const newName = prompt('请输入新名称：', tpl ? tpl.name : '');
                if (newName && newName.trim()) renameCustomTemplate(tabId, newName.trim());
            } else if (action === 'duplicate') {
                duplicateCustomTemplate(tabId);
            } else if (action === 'export') {
                const tpl = state.customTemplates.find(t => t.id === tabId);
                if (tpl) {
                    const blob = new Blob([JSON.stringify(tpl, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${tpl.name}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                }
            } else if (action === 'delete') {
                if (confirm('确定删除该模板？')) removeCustomTemplate(tabId);
            }
        });

        document.body.appendChild(menu);

        const closeMenu = (ev) => {
            if (!menu.contains(ev.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }

    // ========== 模块加载器（修复 Edge 加载时序问题） ==========
    function loadModule(moduleName) {
        return new Promise((resolve, reject) => {
            const reg = moduleRegistry[moduleName];
            if (!reg) return reject(new Error('未知模块: ' + moduleName));

            // 实例已存在且正确加载
            if (reg.instance && reg.loaded) {
                reg.instance.activate(App);
                return resolve(reg.instance);
            }

            // 检查是否有共享同一文件且已加载的实例
            const shared = Object.keys(moduleRegistry).find(
                k => k !== moduleName &&
                    moduleRegistry[k].file === reg.file &&
                    moduleRegistry[k].loaded &&
                    moduleRegistry[k].instance
            );
            if (shared) {
                reg.instance = moduleRegistry[shared].instance;
                reg.loaded = true;
                reg.instance.activate(App);
                return resolve(reg.instance);
            }

            // 预注册模块
            if (window.__modules && window.__modules[moduleName]) {
                reg.instance = window.__modules[moduleName];
                reg.loaded = true;
                try {
                    reg.instance.init(document.getElementById('moduleContainer'), App);
                } catch (e) {
                    reg.loaded = false;
                    reg.instance = null;
                    return reject(new Error(moduleName + ' 初始化失败: ' + e.message));
                }
                return resolve(reg.instance);
            }

            // 动态加载脚本（用轮询代替固定延时）
            const script = document.createElement('script');
            script.src = 'modules/' + reg.file;
            script.onload = () => {
                let attempts = 0;
                const maxAttempts = 30;  // 3 秒总等待时间
                const checkInterval = setInterval(() => {
                    attempts++;
                    const mod = window.__modules && window.__modules[moduleName];
                    if (mod && typeof mod.init === 'function') {
                        clearInterval(checkInterval);
                        reg.instance = mod;
                        reg.loaded = true;
                        try {
                            mod.init(document.getElementById('moduleContainer'), App);
                            resolve(mod);
                        } catch (e) {
                            reg.loaded = false;
                            reg.instance = null;
                            reject(new Error(moduleName + ' 初始化失败: ' + e.message));
                        }
                    } else if (attempts >= maxAttempts) {
                        clearInterval(checkInterval);
                        reject(new Error(moduleName + ' 未正确暴露（超时）'));
                    }
                }, 100);
            };
            script.onerror = () => reject(new Error('加载 ' + reg.file + ' 失败，请检查文件是否存在'));
            document.head.appendChild(script);
        });
    }

    // ========== UI 控制 ==========
    function updateUI() {
        const yuqingTab = document.getElementById('yuqingTab');
        const copyBtns = document.getElementById('copyBtns');
        const previewAll = document.getElementById('previewAll');
        const editBtn = document.getElementById('editBtn');
        const saveDefaultBtn = document.getElementById('saveDefaultBtn');
        const resetBtn = document.getElementById('resetBtn');
        const clearAllBtn = document.getElementById('clearAllBtn');

        const show = (el, d) => { if (el) el.style.display = d; };

        // 待办提醒模块：隐藏舆情相关的工具栏/预览/子标签
        if (state.currM === 'reminder') {
            show(yuqingTab, 'none');
            show(copyBtns, 'none');
            show(previewAll, 'none');
            show(editBtn, 'none');
            show(saveDefaultBtn, 'none');
            show(resetBtn, 'none');
            show(clearAllBtn, 'none');
            return;
        }

        const isRQ = state.currM === 'richang' || state.currM === 'quantao';
        const isC = state.currM.startsWith('tpl_');
        const isBuild = state.currM === 'build';
        const isNews = state.currM === 'news';

        if (isNews) {
            show(yuqingTab, 'none');
            show(copyBtns, 'none');
            show(previewAll, 'none');
            show(editBtn, 'none');
            show(saveDefaultBtn, 'none');
            show(resetBtn, 'none');
            show(clearAllBtn, 'inline-block');
        } else if (isBuild) {
            show(yuqingTab, 'none');
            show(copyBtns, 'none');
            show(previewAll, 'none');
            show(editBtn, 'inline-block');
            show(saveDefaultBtn, 'inline-block');
            show(resetBtn, 'inline-block');
            show(clearAllBtn, 'inline-block');
        } else if (isRQ || isC) {
            show(yuqingTab, 'block');
            show(copyBtns, 'flex');
            show(previewAll, 'block');
            show(editBtn, 'inline-block');
            show(saveDefaultBtn, 'inline-block');
            show(resetBtn, 'inline-block');
            show(clearAllBtn, 'inline-block');
        } else {
            show(yuqingTab, 'none');
            show(copyBtns, 'none');
            show(previewAll, 'none');
            show(editBtn, 'none');
            show(saveDefaultBtn, 'none');
            show(resetBtn, 'none');
            show(clearAllBtn, 'inline-block');
        }
    }

    async function renderModule() {
        updateUI();
        try {
            await loadModule(state.currM);
        } catch (e) {
            document.getElementById('moduleContainer').innerHTML =
                '<p style="color:red;text-align:center;">' + e.message + '</p>';
        }
    }

    // ========== App 实例 ==========
    const App = {
        EventBus: new EventBusClass(),
        api: API,
        state,
        loadModule,
        renderModule,
        renderMainTabs,
        refreshCustomTemplates,
        addCustomTemplate,
        removeCustomTemplate,
        renameCustomTemplate,
        duplicateCustomTemplate,
        getStoragePrefix: () => STORAGE_PREFIX
    };
    window.App = App;
    window.__modules = window.__modules || {};

    // ========== 计算器加载 ==========
    function loadCalculator() {
        const script = document.createElement('script');
        script.src = 'modules/calc-module.js';
        script.onload = () => {
            const calcMod = window.__modules && window.__modules['calc'];
            if (calcMod && typeof calcMod.init === 'function') calcMod.init(App);
        };
        document.head.appendChild(script);
    }

    // ========== 待办提醒模块预加载（页面启动即建立数据库与轮询，使提醒常驻） ==========
    function loadReminderModule() {
        const script = document.createElement('script');
        script.src = 'modules/reminder-module.js';
        script.onload = () => {
            const rmMod = window.__modules && window.__modules['reminder'];
            if (rmMod && typeof rmMod._start === 'function') rmMod._start(App);
        };
        document.head.appendChild(script);
    }

    // ========== 随手记（悬浮面板） ==========
    function initScratchpad() {
        // 防止入口脚本意外重复执行时重复创建组件和事件监听器。
        if (document.getElementById('scratchpadToggle') || document.getElementById('scratchpadPanel')) return;

        const NOTE_KEY = 'scratchpad_note';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'scratchpadToggle';
        btn.textContent = '📝';
        btn.title = '随手记';
        btn.setAttribute('aria-expanded', 'false');
        document.body.appendChild(btn);

        const panel = document.createElement('div');
        panel.id = 'scratchpadPanel';
        panel.innerHTML =
            '<div class="sp-header">' +
                '<span>随手记</span>' +
                '<div>' +
                    '<button type="button" id="spFullscreenBtn" title="全屏">⛶</button>' +
                    '<button type="button" id="spClearBtn" title="清空">🗑️</button>' +
                '</div>' +
            '</div>' +
            '<textarea id="spTextarea" placeholder="写点什么...自动保存"></textarea>' +
            '<div id="spStatus">已保存</div>';
        document.body.appendChild(panel);

        const textarea = panel.querySelector('#spTextarea');
        const status = panel.querySelector('#spStatus');
        const clearBtn = panel.querySelector('#spClearBtn');
        const fullscreenBtn = panel.querySelector('#spFullscreenBtn');

        const saved = API.storageGet(NOTE_KEY);
        if (saved && typeof saved.content === 'string') textarea.value = saved.content;

        let saveTimer = null;
        function saveNow() {
            if (saveTimer) {
                clearTimeout(saveTimer);
                saveTimer = null;
            }
            API.storageSet(NOTE_KEY, {
                content: textarea.value,
                updatedAt: Date.now()
            });
            status.textContent = '已保存 ' + new Date().toLocaleTimeString();
        }

        textarea.addEventListener('input', () => {
            if (saveTimer) clearTimeout(saveTimer);
            status.textContent = '保存中...';
            saveTimer = setTimeout(saveNow, 500);
        });

        function setOpen(open) {
            panel.classList.toggle('show', Boolean(open));
            btn.setAttribute('aria-expanded', String(Boolean(open)));
            if (!open) panel.classList.remove('fullscreen');
        }

        function setFullscreen(fullscreen) {
            const enabled = Boolean(fullscreen);
            panel.classList.add('show');
            panel.classList.toggle('fullscreen', enabled);
            btn.setAttribute('aria-expanded', 'true');
            fullscreenBtn.textContent = enabled ? '⤢' : '⛶';
            fullscreenBtn.title = enabled ? '退出全屏' : '全屏';
            if (enabled) {
                try { textarea.focus({ preventScroll: true }); } catch (_) { textarea.focus(); }
            }
        }

        btn.addEventListener('click', () => {
            const open = !panel.classList.contains('show');
            setOpen(open);
            if (open) {
                try { textarea.focus({ preventScroll: true }); } catch (_) { textarea.focus(); }
            }
        });

        clearBtn.addEventListener('click', () => {
            if (!confirm('确定清空随手记内容？')) return;
            textarea.value = '';
            API.storageRemove(NOTE_KEY);
            if (saveTimer) {
                clearTimeout(saveTimer);
                saveTimer = null;
            }
            status.textContent = '已清空';
            textarea.focus();
        });

        fullscreenBtn.addEventListener('click', () => {
            setFullscreen(!panel.classList.contains('fullscreen'));
        });

        // 内部交互不再向页面级 click 监听器冒泡。
        panel.addEventListener('click', (event) => event.stopPropagation());

        document.addEventListener('pointerdown', (event) => {
            if (!panel.classList.contains('show')) return;
            if (panel.contains(event.target) || btn.contains(event.target)) return;
            setOpen(false);
        }, true);

        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape' || !panel.classList.contains('show')) return;
            event.preventDefault();
            if (panel.classList.contains('fullscreen')) setFullscreen(false);
            else setOpen(false);
        });

        // 页面离开前立即落盘，避免防抖窗口内的最后一次输入丢失。
        window.addEventListener('pagehide', saveNow);
    }

    // ========== 图片暂存板 ==========
    class ImagePadDB {
        constructor() { this.db = null; }
        async open() {
            return new Promise((resolve, reject) => {
                const req = indexedDB.open('ImagePadDB', 1);
                req.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains('images')) {
                        const store = db.createObjectStore('images', { keyPath: 'id', autoIncrement: true });
                        store.createIndex('createdAt', 'createdAt', { unique: false });
                    }
                };
                req.onsuccess = (event) => {
                    this.db = event.target.result;
                    this.db.onversionchange = () => this.db.close();
                    resolve();
                };
                req.onerror = () => reject(req.error);
            });
        }
        async add(item) {
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction('images', 'readwrite');
                const req = tx.objectStore('images').add(item);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        }
        async getAll() {
            return new Promise((resolve, reject) => {
                const req = this.db.transaction('images', 'readonly').objectStore('images').getAll();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => reject(req.error);
            });
        }
        async delete(id) {
            return new Promise((resolve, reject) => {
                const req = this.db.transaction('images', 'readwrite').objectStore('images').delete(id);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        }
        async clear() {
            return new Promise((resolve, reject) => {
                const req = this.db.transaction('images', 'readwrite').objectStore('images').clear();
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        }
    }

    async function initImagePad() {
        if (document.getElementById('imagepadToggle') || document.getElementById('imagepadPanel')) return;

        const db = new ImagePadDB();
        let images;
        try {
            await db.open();
            images = await db.getAll();
        } catch (error) {
            console.error('[图片暂存板] 初始化失败:', error);
            if (typeof window.message === 'function') window.message('图片暂存板初始化失败，请检查浏览器 IndexedDB 权限', 'error');
            return;
        }

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'imagepadToggle';
        btn.textContent = '🖼️';
        btn.title = '图片暂存板';
        btn.setAttribute('aria-expanded', 'false');
        document.body.appendChild(btn);

        const panel = document.createElement('div');
        panel.id = 'imagepadPanel';
        panel.innerHTML =
            '<div class="imghdr">' +
                '<span>图片暂存 (' + images.length + ')</span>' +
                '<div>' +
                    '<button type="button" id="imgFullscreenBtn" title="全屏">⛶</button>' +
                    '<button type="button" id="imgClearBtn" title="清空">🗑️</button>' +
                '</div>' +
            '</div>' +
            '<div id="imgGrid" class="img-grid">' + renderGrid(images) + '</div>' +
            '<div id="imgStatus">支持 Ctrl+V 粘贴图片，点击图片放大查看</div>';
        document.body.appendChild(panel);

        const gridEl = panel.querySelector('#imgGrid');
        const statusEl = panel.querySelector('#imgStatus');
        const clearBtn = panel.querySelector('#imgClearBtn');
        const fullscreenBtn = panel.querySelector('#imgFullscreenBtn');
        let activePreviewClose = null;

        function renderGrid(items) {
            if (!items.length) return '<div class="img-empty" style="color:#ccc;text-align:center;padding:40px;">暂无图片</div>';
            const sorted = [...items].sort((a, b) => b.createdAt - a.createdAt);
            return sorted.map((img) =>
                '<div class="img-item" data-id="' + Number(img.id) + '">' +
                    '<img src="' + img.dataUrl + '" title="点击放大查看" alt="暂存图片">' +
                    '<button type="button" class="img-del-btn" data-id="' + Number(img.id) + '" title="删除图片">×</button>' +
                '</div>'
            ).join('');
        }

        async function refreshGrid() {
            images = await db.getAll();
            gridEl.innerHTML = renderGrid(images);
            const count = panel.querySelector('.imghdr span');
            if (count) count.textContent = '图片暂存 (' + images.length + ')';
        }

        function setOpen(open) {
            panel.classList.toggle('show', Boolean(open));
            btn.setAttribute('aria-expanded', String(Boolean(open)));
            if (!open) panel.classList.remove('fullscreen');
        }

        function setFullscreen(fullscreen) {
            const enabled = Boolean(fullscreen);
            panel.classList.add('show');
            panel.classList.toggle('fullscreen', enabled);
            btn.setAttribute('aria-expanded', 'true');
            fullscreenBtn.textContent = enabled ? '⤢' : '⛶';
            fullscreenBtn.title = enabled ? '退出全屏' : '全屏';
        }

        async function addImage(blob) {
            const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(reader.error || new Error('图片读取失败'));
                reader.readAsDataURL(blob);
            });
            const id = await db.add({ dataUrl, createdAt: Date.now() });
            images.push({ id, dataUrl, createdAt: Date.now() });

            if (images.length > 50) {
                const oldest = [...images].sort((a, b) => a.createdAt - b.createdAt)
                    .slice(0, images.length - 50);
                for (const item of oldest) await db.delete(item.id);
            }
            await refreshGrid();
            statusEl.textContent = '已添加图片';
        }

        function openPreview(imgData) {
            if (activePreviewClose) activePreviewClose();

            const overlay = document.createElement('div');
            overlay.className = 'img-preview-overlay';
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.setAttribute('aria-label', '图片预览');
            overlay.style.cssText =
                'position:fixed;inset:0;width:100%;height:100%;background:rgba(0,0,0,0.88);' +
                'z-index:2147482500;display:flex;align-items:center;justify-content:center;' +
                'flex-direction:column;padding:24px;box-sizing:border-box;';

            const img = document.createElement('img');
            img.src = imgData.dataUrl;
            img.alt = '图片预览';
            img.style.maxWidth = 'min(92vw, 1400px)';
            img.style.maxHeight = '78vh';
            img.style.objectFit = 'contain';

            const btnRow = document.createElement('div');
            btnRow.style.cssText = 'display:flex;gap:10px;margin-top:16px;';
            btnRow.innerHTML =
                '<button type="button" id="previewCopyBtn" style="padding:8px 16px;background:#1677ff;color:#fff;border:none;border-radius:4px;cursor:pointer;">📋 复制图片</button>' +
                '<button type="button" id="previewCloseBtn" style="padding:8px 16px;background:#f5f5f5;border:1px solid #ddd;border-radius:4px;cursor:pointer;">关闭</button>';

            overlay.appendChild(img);
            overlay.appendChild(btnRow);
            document.body.appendChild(overlay);

            const closePreview = () => {
                document.removeEventListener('keydown', onPreviewKeydown, true);
                overlay.remove();
                if (activePreviewClose === closePreview) activePreviewClose = null;
            };
            const onPreviewKeydown = (event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                event.stopPropagation();
                closePreview();
            };
            activePreviewClose = closePreview;
            document.addEventListener('keydown', onPreviewKeydown, true);

            overlay.addEventListener('click', (event) => {
                if (event.target === overlay) closePreview();
                event.stopPropagation();
            });
            overlay.querySelector('#previewCloseBtn').addEventListener('click', closePreview);
            overlay.querySelector('#previewCopyBtn').addEventListener('click', async () => {
                try {
                    if (!navigator.clipboard || !navigator.clipboard.write || typeof ClipboardItem === 'undefined') {
                        throw new Error('当前浏览器不支持复制图片');
                    }
                    const response = await fetch(imgData.dataUrl);
                    const blob = await response.blob();
                    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
                    statusEl.textContent = '已复制图片到剪贴板';
                    if (typeof window.message === 'function') window.message('已复制图片到剪贴板', 'success');
                } catch (error) {
                    statusEl.textContent = error.message || '复制失败，请重试';
                    if (typeof window.message === 'function') window.message(statusEl.textContent, 'error');
                }
            });
        }

        // 单一事件委托：先判断删除按钮，再判断图片预览，避免两个同级监听器互相冲突。
        gridEl.addEventListener('click', async (event) => {
            const deleteButton = event.target.closest('.img-del-btn');
            if (deleteButton) {
                event.preventDefault();
                event.stopPropagation();
                const id = Number(deleteButton.dataset.id);
                try {
                    await db.delete(id);
                    images = images.filter((item) => item.id !== id);
                    await refreshGrid();
                } catch (error) {
                    console.error('[图片暂存板] 删除失败:', error);
                    statusEl.textContent = '删除失败，请重试';
                }
                return;
            }

            const imgItem = event.target.closest('.img-item');
            if (!imgItem) return;
            const id = Number(imgItem.dataset.id);
            const imgData = images.find((item) => item.id === id);
            if (imgData) openPreview(imgData);
        });

        clearBtn.addEventListener('click', async () => {
            if (!confirm('清空所有图片？')) return;
            try {
                await db.clear();
                images = [];
                await refreshGrid();
                statusEl.textContent = '已清空';
            } catch (error) {
                console.error('[图片暂存板] 清空失败:', error);
                statusEl.textContent = '清空失败，请重试';
            }
        });

        fullscreenBtn.addEventListener('click', () => {
            setFullscreen(!panel.classList.contains('fullscreen'));
        });

        btn.addEventListener('click', () => {
            setOpen(!panel.classList.contains('show'));
        });

        panel.addEventListener('click', (event) => event.stopPropagation());

        // 在 document 层监听粘贴，避免面板 div 未获得焦点时收不到 paste 事件。
        document.addEventListener('paste', async (event) => {
            if (!panel.classList.contains('show')) return;
            const target = event.target;
            const isEditable = target && (
                target.isContentEditable ||
                /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName || '')
            );
            if (isEditable && !panel.contains(target)) return;

            const items = Array.from((event.clipboardData && event.clipboardData.items) || []);
            const imageItems = items.filter((item) => item.type && item.type.startsWith('image/'));
            if (!imageItems.length) return;

            event.preventDefault();
            for (const item of imageItems) {
                const blob = item.getAsFile();
                if (!blob) continue;
                try {
                    await addImage(blob);
                } catch (error) {
                    console.error('[图片暂存板] 粘贴图片失败:', error);
                    statusEl.textContent = '添加图片失败，请重试';
                }
            }
        });

        document.addEventListener('pointerdown', (event) => {
            if (!panel.classList.contains('show')) return;
            if (panel.contains(event.target) || btn.contains(event.target)) return;
            if (event.target.closest && event.target.closest('.img-preview-overlay')) return;
            if (activePreviewClose) return;
            setOpen(false);
        }, true);

        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape' || !panel.classList.contains('show')) return;
            if (activePreviewClose) return;
            event.preventDefault();
            if (panel.classList.contains('fullscreen')) setFullscreen(false);
            else setOpen(false);
        });
    }

    // ========== 初始化 ==========
    function init() {
        loadCustomTemplates();
        renderMainTabs();
        document.querySelectorAll('#yuqingTab span').forEach(el => {
            el.addEventListener('click', function() {
                document.querySelectorAll('#yuqingTab span').forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                state.currS = this.dataset.s;
                App.EventBus.emit('subTabChange', state.currS);
                const reg = moduleRegistry[state.currM];
                if (reg && reg.instance && typeof reg.instance.onSubTabChange === 'function') reg.instance.onSubTabChange(state.currS);
            });
        });
        document.getElementById('editBtn')?.addEventListener('click', () => App.EventBus.emit('toggleEditMode'));
        document.getElementById('saveDefaultBtn')?.addEventListener('click', () => App.EventBus.emit('saveDefault'));
        document.getElementById('resetBtn')?.addEventListener('click', () => App.EventBus.emit('resetConfig'));
        document.getElementById('clearAllBtn')?.addEventListener('click', () => App.EventBus.emit('clearAll'));
        document.getElementById('copyTipBtn')?.addEventListener('click', () => App.EventBus.emit('copyTip'));
        document.getElementById('copyAddBtn')?.addEventListener('click', () => App.EventBus.emit('copyAdd'));
        loadCalculator();
        loadReminderModule();
        renderModule();
        initScratchpad();
        initImagePad();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})(window, document);