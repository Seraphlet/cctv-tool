/**
 * news-module.js - 新闻搜索与保存模块（本地 IndexedDB 版 + 长期保存开关）
 * 使用分类标签“长期”作为长期保存标记
 * 提示：数据默认保留15天，使用“长期”标签可永久保存
 */
(function(window) {
    'use strict';

    // ========== IndexedDB 数据库类 ==========
    class NewsDB {
        constructor() {
            this.dbName = 'NewsLocalDB';
            this.storeName = 'news';
            this.db = null;
        }
        async open() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this.dbName, 1);
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains(this.storeName)) {
                        const store = db.createObjectStore(this.storeName, {
                            keyPath: 'id',
                            autoIncrement: true
                        });
                        store.createIndex('savedAt', '保存时间', { unique: false });
                        store.createIndex('category', '分类', { unique: false });
                    }
                };
                request.onsuccess = (event) => {
                    this.db = event.target.result;
                    resolve();
                };
                request.onerror = (event) => {
                    reject(event.target.error);
                };
            });
        }
        async add(newsItem) {
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(this.storeName, 'readwrite');
                const store = tx.objectStore(this.storeName);
                const item = { ...newsItem };
                delete item.id;
                const request = store.add(item);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }
        async delete(id) {
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(this.storeName, 'readwrite');
                const store = tx.objectStore(this.storeName);
                const request = store.delete(id);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }
        async getAll() {
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(this.storeName, 'readonly');
                const store = tx.objectStore(this.storeName);
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }
        async clear() {
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(this.storeName, 'readwrite');
                const store = tx.objectStore(this.storeName);
                const request = store.clear();
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }
        async cleanBefore(cutoffDate) {
            const all = await this.getAll();
            const toDelete = all.filter(item => {
                if (!item.保存时间) return false;
                return new Date(item.保存时间) < cutoffDate;
            });
            if (toDelete.length === 0) return 0;
            const tx = this.db.transaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);
            for (const item of toDelete) store.delete(item.id);
            return new Promise((resolve, reject) => {
                tx.oncomplete = () => resolve(toDelete.length);
                tx.onerror = () => reject(tx.error);
            });
        }
    }

    // ========== 前端解析（与后端 parse_news 逻辑一致） ==========
    function parseNews(text) {
        const news = {
            '频道': '', '栏目': '', '标题': '', '播出时间': '',
            '新闻时长': '', '露出时长': '', '记者': '', '摘要': '', '链接': '',
            '分类': '', '永久保存': ''
        };
        const patterns = {
            '频道': /频道[：:]\s*(.+)/,
            '栏目': /栏目[：:]\s*(.+)/,
            '标题': /标题[：:]\s*(.+)/,
            '播出时间': /播出时间[：:]\s*(\d{8}\s+\d{2}:\d{2}:\d{2})/,
            '新闻时长': /新闻时长[：:]\s*([\d']+[\d"]?)/,
            '露出时长': /露出时长[：:]\s*([\d']+[\d"]?)/,
            '记者': /记者[：:]\s*(.+)/,
            '摘要': /摘要[：:]\s*(.+?)(?=\n链接[：:]|\n*$)/,
            '链接': /链接[：:]\s*(https?:\/\/[^\s]+)/
        };
        for (const [key, pattern] of Object.entries(patterns)) {
            const match = text.match(pattern);
            if (match) {
                news[key] = key === '摘要' ? match[1].trim().replace(/\n/g, ' ') : match[1].trim();
            }
        }
        return news;
    }

    // ========== 模块主体 ==========
    const module = {
        name: 'news',

        apiBase: (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
            ? 'http://localhost:5000'
            : '/news-api',

        localDB: null,
        allNewsCache: [],
        searchResults: [],
        currentPage: 1,
        pageSize: 10,
        initialized: false,

        mode: 'offline',
        serverAvailable: false,

        quickTags: ['CCTV12', 'CCTV13', 'CCTV2', '新闻频道', '财经频道', '社会与法频道', '新闻直播间', '共同关注', '对话', '法治在线', '朝闻天下', '东方时空'],
        saveCategoryTags: ['新闻', '笔记', '备忘录', '待办', '长期'],     // 已改为长期
        selectedSaveCategory: '',
        filterCategoryTags: ['新闻', '笔记', '备忘录', '待办', '长期'],  // 已改为长期
        selectedFilterCategory: '',

        // ========== 生命周期 ==========
        async init(container, App) {
            this.App = App;
            this.container = container;
            try {
                this.localDB = new NewsDB();
                await this.localDB.open();
                this.allNewsCache = await this.localDB.getAll();

                await this._checkServer();

                if (this.mode === 'online' && this.serverAvailable && this.allNewsCache.length === 0) {
                    await this._syncFromServer(true);
                }

                await this._autoCleanLocal();
                if (this._cleanTimer) clearInterval(this._cleanTimer);
                this._cleanTimer = setInterval(() => this._autoCleanLocal(), 1000 * 60 * 60 * 24);
                this.initialized = true;

                const savedQuick = this.App.api.storageGet('news_quick_tags');
                if (savedQuick && Array.isArray(savedQuick)) this.quickTags = savedQuick;
                const savedSaveCat = this.App.api.storageGet('news_save_category_tags');
                if (savedSaveCat && Array.isArray(savedSaveCat)) this.saveCategoryTags = savedSaveCat;
                const savedFilterCat = this.App.api.storageGet('news_filter_category_tags');
                if (savedFilterCat && Array.isArray(savedFilterCat)) this.filterCategoryTags = savedFilterCat;
                const savedMode = this.App.api.storageGet('news_mode');
                if (savedMode === 'offline' || savedMode === 'online') this.mode = savedMode;

                this.render();
            } catch (e) {
                console.error('[news] 初始化失败:', e);
                if (this.container) this.container.innerHTML = '<div style="padding:40px;text-align:center;color:#f53f3f;">初始化失败</div>';
            }
        },

        activate(App) { this.App = App; this.render(); },
        destroy() { if (this._cleanTimer) clearInterval(this._cleanTimer); if (this.container) this.container.innerHTML = ''; },

        async _checkServer() {
            try {
                const res = await fetch(`${this.apiBase}/health`, { method: 'GET', signal: AbortSignal.timeout(3000) });
                this.serverAvailable = res.ok;
                if (this.mode === 'offline') this.mode = this.serverAvailable ? 'online' : 'offline';
            } catch (e) {
                this.serverAvailable = false;
            }
        },

        // ========== 渲染 ==========
        render() {
            if (!this.initialized) return;
            const con = this.container;
            if (!con) return;

            const btnGray = 'font-size:11px;padding:4px 12px;background:#f5f5f5;border:1px solid #ddd;border-radius:4px;cursor:pointer;color:#666;';
            const modeLabel = this.mode === 'offline' ? '📴 离线模式' : '🌐 互联模式';
            const modeColor = this.mode === 'offline' ? '#ff7d00' : '#009e5f';
            const modeBg = this.mode === 'offline' ? '#fff7e6' : '#e6fff2';
            const showOnlineFeatures = this.mode === 'online' && this.serverAvailable;

            con.innerHTML = `
                <div style="padding:10px;">
                    <!-- 模式切换条 -->
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding:6px 10px;background:${modeBg};border-radius:6px;">
                        <span style="font-size:12px;font-weight:bold;color:${modeColor};">${modeLabel}</span>
                        <div style="display:flex;gap:4px;align-items:center;">
                            ${this.serverAvailable
                                ? '<span style="font-size:10px;color:#999;">服务器已连接</span>'
                                : '<span style="font-size:10px;color:#f53f3f;">服务器不可用</span>'}
                            <button id="toggleModeBtn" style="font-size:11px;padding:3px 10px;border:1px solid #ccc;border-radius:4px;cursor:pointer;background:#fff;">切换模式</button>
                        </div>
                    </div>

                    <!-- ===== 保存区域 ===== -->
                    <div style="margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid #eee;">
                        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;align-items:center;">
                            <span style="font-size:10px;color:#999;margin-right:2px;">保存为：</span>
                            <span class="save-cat-tag" data-cat="" style="font-size:10px;padding:2px 8px;border-radius:10px;cursor:pointer;white-space:nowrap;user-select:none;${this.selectedSaveCategory===''?'background:#1677ff;color:#fff;border:1px solid #1677ff;':'background:#fff;border:1px solid #ddd;color:#666;'}">默认</span>
                            ${this.saveCategoryTags.map(tag => `<span class="save-cat-tag" data-cat="${tag}" style="font-size:10px;padding:2px 8px;border-radius:10px;cursor:pointer;white-space:nowrap;user-select:none;${this.selectedSaveCategory===tag?'background:#1677ff;color:#fff;border:1px solid #1677ff;':'background:#fff;border:1px solid #ddd;color:#666;'}">${tag}</span>`).join('')}
                            <button id="addSaveCatBtn" style="font-size:10px;padding:2px 6px;background:#fff;border:1px dashed #ccc;border-radius:10px;cursor:pointer;color:#999;">+</button>
                        </div>
                        <div style="display:flex;gap:10px;align-items:flex-end;">
                            <textarea id="newsInput" placeholder="粘贴新闻文本..." style="flex:1;height:80px;padding:8px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;resize:vertical;"></textarea>
                            <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;align-items:center;">
                                <button class="btn btn-primary" id="saveNewsBtn" style="background:#1677ff;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:bold;">💾 保存</button>
                                <span id="saveStatus" style="font-size:11px;color:#999;text-align:center;"></span>
                            </div>
                        </div>
                    </div>

                    <!-- ===== 搜索区域 ===== -->
                    <div>
                        <!-- 快速搜索标签 -->
                        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;align-items:center;">
                            ${this.quickTags.map(tag => `<span class="quick-tag" style="font-size:11px;padding:2px 8px;background:#f0f7ff;border:1px solid #b3d8ff;border-radius:12px;cursor:pointer;white-space:nowrap;user-select:none;">${tag}</span>`).join('')}
                            <button id="addQuickTagBtn" style="font-size:11px;padding:2px 8px;background:#fff;border:1px dashed #ccc;border-radius:12px;cursor:pointer;color:#999;">+</button>
                        </div>

                        <!-- 筛选标签 -->
                        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;align-items:center;">
                            <span style="font-size:10px;color:#999;margin-right:2px;">筛选：</span>
                            <span class="filter-cat-tag" data-cat="" style="font-size:10px;padding:2px 8px;border-radius:10px;cursor:pointer;white-space:nowrap;user-select:none;${this.selectedFilterCategory===''?'background:#1677ff;color:#fff;border:1px solid #1677ff;':'background:#fff;border:1px solid #ddd;color:#666;'}">全部</span>
                            ${this.filterCategoryTags.map(tag => `<span class="filter-cat-tag" data-cat="${tag}" style="font-size:10px;padding:2px 8px;border-radius:10px;cursor:pointer;white-space:nowrap;user-select:none;${this.selectedFilterCategory===tag?'background:#1677ff;color:#fff;border:1px solid #1677ff;':'background:#fff;border:1px solid #ddd;color:#666;'}">${tag}</span>`).join('')}
                            <button id="addFilterCatBtn" style="font-size:10px;padding:2px 6px;background:#fff;border:1px dashed #ccc;border-radius:10px;cursor:pointer;color:#999;">+</button>
                        </div>

                        <!-- 搜索框 -->
                        <div style="display:flex;gap:8px;margin-bottom:8px;">
                            <div style="flex:1;position:relative;">
                                <input type="text" id="searchInput" placeholder="🔍 多关键词空格隔开（或匹配）" style="width:100%;padding:10px 36px 10px 14px;border:2px solid #1677ff;border-radius:8px;font-size:14px;outline:none;box-shadow:0 0 0 3px rgba(22,119,255,0.1);box-sizing:border-box;">
                                <button id="clearSearchBtn" style="display:none;position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;font-size:18px;cursor:pointer;color:#bbb;">✕</button>
                            </div>
                            <button id="searchBtn" style="white-space:nowrap;padding:10px 20px;font-size:14px;font-weight:bold;background:#1677ff;color:#fff;border:none;border-radius:8px;cursor:pointer;">🔍 搜索</button>
                        </div>

                        <!-- 信息栏 + 操作按钮 + 提示 -->
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:6px;">
                            <span id="searchInfo" style="font-size:12px;color:#999;"></span>
                            <div style="display:flex;gap:6px;">
                                ${showOnlineFeatures ? `
                                    <button id="syncFromServerBtn" style="${btnGray}">☁️ 从服务器同步</button>
                                    <button id="uploadToServerBtn" style="${btnGray}">📤 上传到服务器</button>
                                    <button id="clearServerBtn" style="${btnGray}">🗑️ 清空服务器</button>
                                ` : ''}
                                <button id="clearLocalBtn" style="${btnGray}">🗑️ 清空本地</button>
                            </div>
                        </div>
                        <!-- 新增：数据保留提示 -->
                        <div style="font-size:10px;color:#aaa;text-align:right;margin-bottom:4px;">
                            ⚠️ 数据默认保留15天，使用“长期”标签可永久保存
                        </div>

                        <!-- 结果 -->
                        <div id="searchResults" style="min-height:300px;max-height:calc(100vh - 480px);overflow-y:auto;border:1px solid #e0e0e0;border-radius:6px;padding:10px;background:#fafafa;">
                            <div style="color:#ccc;text-align:center;padding-top:40px;">输入关键词搜索</div>
                        </div>
                        <div id="pagination" style="display:none;margin-top:8px;text-align:center;"></div>
                    </div>
                </div>
            `;

            this._bindEvents();
            this._updateClearBtn();
            this._searchLocal();
        },

        // ========== 事件绑定 ==========
        _bindEvents() {
            // 模式切换
            document.getElementById('toggleModeBtn').addEventListener('click', () => {
                this.mode = this.mode === 'online' ? 'offline' : 'online';
                this.App.api.storageSet('news_mode', this.mode);
                this.render();
            });

            // 保存分类标签
            document.querySelectorAll('.save-cat-tag').forEach(tag => {
                tag.addEventListener('click', () => { this.selectedSaveCategory = tag.dataset.cat; this.render(); });
                tag.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    const cat = tag.dataset.cat;
                    if (!cat) return;
                    if (cat === '长期') {
                        message('“长期”是内置分类，不可删除', 'warning');
                        return;
                    }
                    if (confirm('删除保存分类 "' + cat + '"？')) {
                        this.saveCategoryTags = this.saveCategoryTags.filter(t => t !== cat);
                        if (this.selectedSaveCategory === cat) this.selectedSaveCategory = '';
                        this.App.api.storageSet('news_save_category_tags', this.saveCategoryTags);
                        this.render();
                    }
                });
            });
            document.getElementById('addSaveCatBtn').addEventListener('click', () => {
                const t = prompt('输入新保存分类名：');
                if (t && t.trim() && !this.saveCategoryTags.includes(t.trim())) {
                    this.saveCategoryTags.push(t.trim());
                    this.App.api.storageSet('news_save_category_tags', this.saveCategoryTags);
                    this.render();
                }
            });

            // 保存
            document.getElementById('saveNewsBtn').addEventListener('click', () => this._saveNews());

            // 搜索
            document.getElementById('searchBtn').addEventListener('click', () => { this.currentPage = 1; this._searchLocal(); });
            const searchInput = document.getElementById('searchInput');
            searchInput.addEventListener('input', () => { this._updateClearBtn(); });
            searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { this.currentPage = 1; this._searchLocal(); } });
            document.getElementById('clearSearchBtn').addEventListener('click', () => {
                searchInput.value = '';
                document.getElementById('clearSearchBtn').style.display = 'none';
                this.currentPage = 1;
                this._searchLocal();
            });

            // 快速标签
            document.querySelectorAll('.quick-tag').forEach(tag => {
                tag.addEventListener('click', () => { this._appendSearchWord(tag.textContent); });
                tag.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    if (confirm('删除标签 "' + tag.textContent + '"？')) {
                        this.quickTags = this.quickTags.filter(t => t !== tag.textContent);
                        this.App.api.storageSet('news_quick_tags', this.quickTags);
                        this.render();
                    }
                });
            });
            document.getElementById('addQuickTagBtn').addEventListener('click', () => {
                const t = prompt('输入新快速标签：');
                if (t && t.trim() && !this.quickTags.includes(t.trim())) {
                    this.quickTags.push(t.trim());
                    this.App.api.storageSet('news_quick_tags', this.quickTags);
                    this.render();
                }
            });

            // 筛选分类
            document.querySelectorAll('.filter-cat-tag').forEach(tag => {
                tag.addEventListener('click', () => {
                    this.selectedFilterCategory = tag.dataset.cat;
                    this.render();
                });
                tag.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    const cat = tag.dataset.cat;
                    if (!cat) return;
                    if (cat === '长期') {
                        message('“长期”是内置分类，不可删除', 'warning');
                        return;
                    }
                    if (confirm('删除筛选分类 "' + cat + '"？')) {
                        this.filterCategoryTags = this.filterCategoryTags.filter(t => t !== cat);
                        if (this.selectedFilterCategory === cat) this.selectedFilterCategory = '';
                        this.App.api.storageSet('news_filter_category_tags', this.filterCategoryTags);
                        this.render();
                    }
                });
            });
            document.getElementById('addFilterCatBtn').addEventListener('click', () => {
                const t = prompt('输入新筛选分类名：');
                if (t && t.trim() && !this.filterCategoryTags.includes(t.trim())) {
                    this.filterCategoryTags.push(t.trim());
                    this.App.api.storageSet('news_filter_category_tags', this.filterCategoryTags);
                    this.render();
                }
            });

            // 在线功能按钮
            if (this.mode === 'online' && this.serverAvailable) {
                const syncBtn = document.getElementById('syncFromServerBtn');
                if (syncBtn) syncBtn.addEventListener('click', () => this._syncFromServer(false));
                const uploadBtn = document.getElementById('uploadToServerBtn');
                if (uploadBtn) uploadBtn.addEventListener('click', () => this._uploadToServer());
                const clearServerBtn = document.getElementById('clearServerBtn');
                if (clearServerBtn) clearServerBtn.addEventListener('click', () => this._confirmClear('server'));
            }

            // 清空本地
            document.getElementById('clearLocalBtn').addEventListener('click', () => this._confirmClear('local'));
        },

        _appendSearchWord(word) {
            const input = document.getElementById('searchInput');
            if (!input) return;
            const currentVal = input.value.trim();
            const existing = currentVal.split(/\s+/).filter(Boolean);
            if (existing.includes(word)) return;
            input.value = currentVal ? currentVal + ' ' + word : word;
            document.getElementById('clearSearchBtn').style.display = 'block';
            this.currentPage = 1;
            this._searchLocal();
            input.focus();
        },

        _updateClearBtn() {
            const input = document.getElementById('searchInput');
            const btn = document.getElementById('clearSearchBtn');
            if (input && btn) btn.style.display = input.value.trim() ? 'block' : 'none';
        },

        // ========== 删除弹窗 ==========
        _showDeleteDialog(id, saveTime, rawText) {
            const hasServer = this.mode === 'online' && this.serverAvailable;
            document.querySelectorAll('[data-news-overlay]').forEach(o => o.remove());
            const overlay = document.createElement('div');
            overlay.setAttribute('data-news-overlay', '1');
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:2000;display:flex;align-items:center;justify-content:center;';
            overlay.innerHTML = `
                <div style="background:#fff;border-radius:10px;padding:24px;max-width:400px;width:90%;box-shadow:0 8px 30px rgba(0,0,0,0.25);text-align:center;">
                    <div style="font-size:16px;font-weight:bold;margin-bottom:8px;">确认删除</div>
                    <div style="font-size:13px;color:#666;margin-bottom:20px;">请选择删除方式：</div>
                    <div style="display:flex;flex-direction:column;gap:10px;">
                        <button id="delLocalBtn" style="padding:10px;background:#fff;border:1px solid #f53f3f;border-radius:6px;color:#f53f3f;cursor:pointer;font-size:14px;">🗑️ 删除本地</button>
                        ${hasServer ? `<button id="delBothBtn" style="padding:10px;background:#f53f3f;border:none;border-radius:6px;color:#fff;cursor:pointer;font-size:14px;">🗑️ 删除本地和服务器</button>` : ''}
                        <button id="cancelDelBtn" style="padding:10px;background:#f5f5f5;border:1px solid #ddd;border-radius:6px;color:#666;cursor:pointer;font-size:14px;">取消</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

            const close = () => overlay.remove();
            overlay.querySelector('#cancelDelBtn').addEventListener('click', close);
            overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

            overlay.querySelector('#delLocalBtn').addEventListener('click', async () => {
                close();
                await this._deleteNews(id, saveTime, rawText, 'local');
            });

            if (hasServer) {
                overlay.querySelector('#delBothBtn').addEventListener('click', async () => {
                    close();
                    await this._deleteNews(id, saveTime, rawText, 'both');
                });
            }
        },

        async _deleteNews(id, saveTime, rawText, scope) {
            try {
                await this.localDB.delete(id);
                this.allNewsCache = this.allNewsCache.filter(item => item.id !== id);

                if (scope === 'both') {
                    await fetch(`${this.apiBase}/delete`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ save_time: saveTime, raw_text: rawText })
                    }).catch(() => {});
                }
                this._searchLocal();
            } catch (e) {
                console.error('删除失败:', e);
                message('删除失败', 'error');
            }
        },

        // ========== 清空（二次确认） ==========
        _confirmClear(type) {
            const label = type === 'local' ? '本地数据' : '服务器数据';
            if (!confirm(`⚠️ 此操作将清空${label}，不可恢复！\n\n确定要继续吗？`)) return;
            const userInput = prompt(`请输入"确定"二字确认清空${label}：`);
            if (userInput === null) return;
            if (userInput.trim() !== '确定') {
                message('输入错误，操作已取消', 'error');
                return;
            }
            if (type === 'local') this._clearLocal();
            else this._clearServer();
        },

        async _clearLocal() {
            await this.localDB.clear();
            this.allNewsCache = [];
            this.searchResults = [];
            document.getElementById('searchResults').innerHTML = '<div style="color:#ccc;text-align:center;padding-top:40px;">本地数据已清空</div>';
            document.getElementById('pagination').style.display = 'none';
            document.getElementById('searchInfo').textContent = '本地数据已清空';
        },

        async _clearServer() {
            try {
                await fetch(`${this.apiBase}/delete_all`, { method: 'POST' });
                message('服务器数据已清空', 'success');
            } catch (e) { message('清空服务器失败', 'error'); }
        },

        // ========== 搜索（或逻辑） ==========
        _searchLocal() {
            const searchInput = document.getElementById('searchInput');
            if (!searchInput) return;
            const keyword = searchInput.value.trim();
            const infoEl = document.getElementById('searchInfo');
            const resultsDiv = document.getElementById('searchResults');

            let results = [...this.allNewsCache];
            if (this.selectedFilterCategory) {
                results = results.filter(item => item.分类 === this.selectedFilterCategory);
            }
            if (keyword) {
                const keywords = keyword.split(/\s+/).filter(Boolean).map(k => k.toLowerCase());
                results = results.filter(item => {
                    const text = [item.频道, item.栏目, item.标题, item.播出时间, item.记者, item.摘要, item.原始文本].join(' ').toLowerCase();
                    return keywords.some(kw => text.includes(kw));
                });
            }
            results.sort((a, b) => (b.保存时间 || '').localeCompare(a.保存时间));
            this.searchResults = results;

            const sizeMB = JSON.stringify(this.allNewsCache).length / 1024 / 1024;
            const filterInfo = this.selectedFilterCategory ? ` · 筛选：${this.selectedFilterCategory}` : '';
            infoEl.textContent = keyword
                ? `找到 ${results.length} 条${filterInfo}（总计 ${this.allNewsCache.length} 条 · ${sizeMB.toFixed(1)}MB）`
                : `共 ${results.length} 条${filterInfo}（${sizeMB.toFixed(1)}MB）`;

            if (results.length === 0) {
                resultsDiv.innerHTML = '<div style="color:#999;text-align:center;padding-top:40px;">无匹配结果</div>';
                document.getElementById('pagination').style.display = 'none';
                return;
            }
            const searchKeywords = keyword ? keyword.split(/\s+/).filter(k => k.length > 0) : [];
            this._renderResults(searchKeywords);
        },

        _renderResults(keywords) {
            const resultsDiv = document.getElementById('searchResults');
            const paginationDiv = document.getElementById('pagination');
            const start = (this.currentPage - 1) * this.pageSize;
            const end = Math.min(start + this.pageSize, this.searchResults.length);
            const pageResults = this.searchResults.slice(start, end);

            let html = '';
            pageResults.forEach((item, idx) => {
                const content = item['原始文本'] || item.raw_text || '';
                const globalIdx = start + idx + 1;
                const saveTime = item['保存时间'] || '';
                let timeLabel = '';
                if (saveTime) {
                    const daysAgo = Math.floor((Date.now() - new Date(saveTime).getTime()) / 86400000);
                    if (daysAgo === 0) timeLabel = '今天';
                    else if (daysAgo > 0) timeLabel = `${daysAgo}天前`;
                }
                const category = item.分类 || '';
                const metaParts = [];
                if (item.频道) metaParts.push(item.频道);
                if (item.栏目) metaParts.push(item.栏目);
                if (item.播出时间) metaParts.push(item.播出时间);
                if (item.记者) metaParts.push(`记者：${item.记者}`);
                const metaLine = metaParts.length > 0 ? metaParts.join(' · ') : '';

                // 永久保存标记
                const isPermanent = item.永久保存 === '是' || item.永久保存 === 'true';
                const permanentIcon = isPermanent ? ' 📌' : '';

                html += `
                    <div class="search-result-item" style="padding:10px;margin-bottom:8px;border:1px solid #e8e8e8;border-radius:6px;background:#fff;" data-id="${item.id}" data-index="${start + idx}">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                            <span style="display:flex;align-items:center;gap:6px;font-size:11px;">
                                <span style="color:#1677ff;font-weight:500;">#${globalIdx}</span>
                                ${category ? `<span style="background:#e6f7ff;color:#1677ff;padding:0 6px;border-radius:8px;font-size:10px;">${category}</span>` : ''}
                                ${timeLabel ? `<span style="color:#999;">· ${timeLabel}${permanentIcon}</span>` : ''}
                            </span>
                            <button class="del-result-btn" data-id="${item.id}" data-save-time="${this._escapeAttr(saveTime)}" data-raw-text="${this._escapeAttr(content)}" style="background:none;border:none;color:#f53f3f;cursor:pointer;font-size:18px;padding:0 6px;line-height:1;" title="删除">×</button>
                        </div>
                        ${metaLine ? `<div style="font-size:11px;color:#666;margin-bottom:4px;">${metaLine}</div>` : ''}
                        <div class="result-preview" style="white-space:pre-wrap;font-size:13px;line-height:1.7;color:#333;max-height:200px;overflow:hidden;cursor:pointer;">${this._highlightKeywords(content, keywords)}</div>
                        ${content.length > 300 ? '<div style="color:#1677ff;font-size:11px;margin-top:4px;">点击查看完整内容...</div>' : ''}
                    </div>
                `;
            });

            resultsDiv.innerHTML = html;
            resultsDiv.scrollTop = 0;

            resultsDiv.querySelectorAll('.del-result-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._showDeleteDialog(
                        parseInt(btn.dataset.id),
                        btn.dataset.saveTime,
                        btn.dataset.rawText
                    );
                });
            });

            resultsDiv.querySelectorAll('.result-preview').forEach(preview => {
                preview.addEventListener('click', () => {
                    const item = preview.closest('.search-result-item');
                    const index = parseInt(item.dataset.index);
                    this._showDetail(this.searchResults[index]['原始文本'] || '', keywords);
                });
            });

            const totalPages = Math.ceil(this.searchResults.length / this.pageSize);
            if (totalPages > 1) {
                paginationDiv.style.display = 'flex';
                paginationDiv.style.justifyContent = 'center';
                paginationDiv.style.alignItems = 'center';
                paginationDiv.style.gap = '8px';
                paginationDiv.innerHTML = `
                    <button class="btn btn-light btn-sm" ${this.currentPage===1?'disabled':''} id="prevPageBtn">◀</button>
                    <span style="font-size:12px;color:#666;">${this.currentPage}/${totalPages}</span>
                    <button class="btn btn-light btn-sm" ${this.currentPage===totalPages?'disabled':''} id="nextPageBtn">▶</button>
                `;
                document.getElementById('prevPageBtn').addEventListener('click', () => { if(this.currentPage>1){this.currentPage--;this._renderResults(keywords);} });
                document.getElementById('nextPageBtn').addEventListener('click', () => { if(this.currentPage<totalPages){this.currentPage++;this._renderResults(keywords);} });
            } else { paginationDiv.style.display = 'none'; }
        },

        // ========== 保存（前端解析 + 双写 + 根据分类自动长期） ==========
        async _saveNews() {
            const input = document.getElementById('newsInput');
            const statusEl = document.getElementById('saveStatus');
            const rawText = input.value;
            if (!rawText.trim()) { message('请输入新闻内容', 'warning'); return; }
            statusEl.textContent = '...'; statusEl.style.color = '#999';

            try {
                // 前端解析
                const parsed = parseNews(rawText);
                parsed['原始文本'] = rawText;
                parsed['保存时间'] = new Date().toISOString().replace('T', ' ').substring(0, 19);
                parsed.分类 = this.selectedSaveCategory;

                // ★ 根据分类决定是否长期保存
                const isKeep = this.selectedSaveCategory === '长期';
                parsed.永久保存 = isKeep ? '是' : '';

                // 始终保存本地
                const id = await this.localDB.add(parsed);
                parsed.id = id;
                this.allNewsCache.push(parsed);

                // 互联模式也保存到服务器
                if (this.mode === 'online' && this.serverAvailable) {
                    fetch(`${this.apiBase}/save`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            raw_text: rawText,
                            keep: isKeep
                        })
                    }).catch(() => {});
                    statusEl.textContent = isKeep ? '✅ 本地+服务器（长期保存）' : '✅ 本地+服务器';
                } else {
                    statusEl.textContent = isKeep ? '✅ 已保存（长期保存）' : '✅ 已保存';
                }
                statusEl.style.color = '#009e5f';
                input.value = '';
                this._searchLocal();
            } catch (e) {
                console.error('保存失败:', e);
                statusEl.textContent = '❌';
                statusEl.style.color = '#f53f3f';
            }
            setTimeout(() => { statusEl.textContent = ''; }, 2000);
        },

        // ========== 同步（合并模式，不清空本地） ==========
        async _syncFromServer(silent = false) {
            const infoEl = document.getElementById('searchInfo');
            const syncBtn = document.getElementById('syncFromServerBtn');
            if (syncBtn) { syncBtn.textContent = '⏳ 同步中...'; syncBtn.disabled = true; }
            if (infoEl && !silent) infoEl.textContent = '正在从服务器拉取新数据...';

            try {
                const res = await fetch(`${this.apiBase}/sync`);
                const data = await res.json();
                const serverNews = Array.isArray(data) ? data : (data.results || data.data || []);

                if (serverNews.length === 0) {
                    if (infoEl && !silent) infoEl.textContent = '服务器无数据';
                    if (syncBtn) { syncBtn.textContent = '☁️ 从服务器同步'; syncBtn.disabled = false; }
                    return;
                }

                let addedCount = 0;
                for (const item of serverNews) {
                    const exists = this.allNewsCache.some(
                        local => local['原始文本'] === item['原始文本'] &&
                                 local['保存时间'] === item['保存时间']
                    );
                    if (!exists) {
                        const id = await this.localDB.add(item);
                        item.id = id;
                        this.allNewsCache.push(item);
                        addedCount++;
                    }
                }

                if (infoEl && !silent) {
                    infoEl.textContent = addedCount > 0
                        ? `同步完成，新增 ${addedCount} 条`
                        : '本地已是最新';
                }
                this._searchLocal();
            } catch (e) {
                console.error('[同步] 失败:', e);
                if (infoEl && !silent) infoEl.textContent = '同步失败';
            }
            if (syncBtn) { syncBtn.textContent = '☁️ 从服务器同步'; syncBtn.disabled = false; }
        },

        // ========== 上传本地独有数据到服务器 ==========
        async _uploadToServer() {
            const infoEl = document.getElementById('searchInfo');
            const uploadBtn = document.getElementById('uploadToServerBtn');
            if (uploadBtn) { uploadBtn.textContent = '⏳ 上传中...'; uploadBtn.disabled = true; }
            if (infoEl) infoEl.textContent = '正在对比并上传...';

            try {
                const res = await fetch(`${this.apiBase}/sync`);
                const data = await res.json();
                const serverNews = Array.isArray(data) ? data : (data.results || data.data || []);

                const toUpload = this.allNewsCache.filter(local => {
                    return !serverNews.some(
                        server => server['原始文本'] === local['原始文本'] &&
                                  server['保存时间'] === local['保存时间']
                    );
                });

                if (toUpload.length === 0) {
                    if (infoEl) infoEl.textContent = '服务器数据已完整，无需上传';
                    if (uploadBtn) { uploadBtn.textContent = '📤 上传到服务器'; uploadBtn.disabled = false; }
                    return;
                }

                let uploaded = 0;
                for (const item of toUpload) {
                    try {
                        const isKeep = item.永久保存 === '是';
                        await fetch(`${this.apiBase}/save`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                raw_text: item['原始文本'] || '',
                                keep: isKeep
                            })
                        });
                        uploaded++;
                    } catch (e) {
                        console.warn('上传失败:', item['原始文本'], e);
                    }
                }

                if (infoEl) infoEl.textContent = `上传完成，共 ${uploaded} 条`;
            } catch (e) {
                console.error('[上传] 失败:', e);
                if (infoEl) infoEl.textContent = '上传失败';
            }
            if (uploadBtn) { uploadBtn.textContent = '📤 上传到服务器'; uploadBtn.disabled = false; }
        },

        // ========== 自动清理 ==========
        async _autoCleanLocal() {
            try {
                const cutoff = new Date();
                cutoff.setDate(cutoff.getDate() - 15);
                const deleted = await this.localDB.cleanBefore(cutoff);
                if (deleted > 0) {
                    console.log(`[本地清理] 删除了 ${deleted} 条旧新闻`);
                    this.allNewsCache = await this.localDB.getAll();
                }
            } catch (e) { console.error('[本地清理] 失败:', e); }
        },

        // ========== 工具函数 ==========
        _highlightKeywords(text, keywords) {
            if (!keywords || keywords.length === 0) return this._escapeHtml(text);
            let result = this._escapeHtml(text);
            const sorted = [...keywords].sort((a, b) => b.length - a.length);
            const phs = [];
            sorted.forEach((kw, i) => {
                if (!kw) return;
                const regex = new RegExp(this._escapeRegex(this._escapeHtml(kw)), 'gi');
                const ph = `__KW_${i}__`;
                result = result.replace(regex, m => { phs.push({ ph, original: m }); return ph; });
            });
            phs.forEach(({ ph, original }) => {
                result = result.split(ph).join(`<mark style="background:#ffeb3b;padding:0 2px;border-radius:2px;">${original}</mark>`);
            });
            return result;
        },
        _escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); },
        _escapeHtml(text) { return String(text||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); },
        _escapeAttr(text) { return String(text||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#039;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); },

        _showDetail(content, keywords) {
            document.querySelectorAll('[data-news-overlay]').forEach(o => o.remove());
            const overlay = document.createElement('div');
            overlay.setAttribute('data-news-overlay', '1');
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:center;justify-content:center;';
            overlay.innerHTML = `
                <div style="background:#fff;border-radius:10px;padding:24px;max-width:800px;max-height:85vh;width:95%;display:flex;flex-direction:column;box-shadow:0 8px 30px rgba(0,0,0,0.25);">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;"><span style="font-weight:bold;font-size:16px;">📄 新闻详情</span><button id="closeDetailBtn" style="background:none;border:none;font-size:22px;cursor:pointer;color:#999;">✕</button></div>
                    <div style="flex:1;overflow-y:auto;white-space:pre-wrap;line-height:1.9;font-size:14px;color:#333;padding:10px;background:#fafafa;border-radius:6px;border:1px solid #eee;">${this._highlightKeywords(content, keywords)}</div>
                    <div style="margin-top:15px;display:flex;gap:10px;justify-content:flex-end;"><button id="copyDetailBtn" class="btn btn-light btn-sm">📋 复制</button><button id="closeDetailBtn2" class="btn btn-light btn-sm">关闭</button></div>
                </div>
            `;
            document.body.appendChild(overlay);
            const close = () => overlay.remove();
            overlay.querySelector('#closeDetailBtn').addEventListener('click', close);
            overlay.querySelector('#closeDetailBtn2').addEventListener('click', close);
            overlay.addEventListener('click', e => { if(e.target===overlay) close(); });
            overlay.querySelector('#copyDetailBtn').addEventListener('click', () => {
                navigator.clipboard.writeText(content).then(() => message('已复制', 'success')).catch(() => message('复制失败', 'error'));
            });
        }
    };

    window.__modules = window.__modules || {};
    window.__modules['news'] = module;
})(window);