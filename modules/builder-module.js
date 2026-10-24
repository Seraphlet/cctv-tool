/**
 * builder-module.js - 模板配置模块
 * 从原有的单文件版代码中抽离
 * 功能：修改固定文字、增删组件、保存/恢复模板、编辑模式
 */
(function(window) {
    'use strict';

    const module = {
        name: 'builder',

        // 模块私有状态
        nowTemp: [],
        templateName: '',
        editingTemplateId: null,
        userTemplates: [],
        editMode: false,
        lastTipValues: { channelNum: '', channelName: '', columnName: '', broadcastText: '' },

        // 默认模板定义
        defaultTemplate: [
            [{ type: 'fix', text: '【央视舆情提示】' }],
            [{ type: 'fix', text: '频道：' }, { type: 'input', text: 'CCTV13' }, { type: 'fix', text: '(' }, { type: 'input', text: '新闻频道' }, { type: 'fix', text: ')' }],
            [{ type: 'fix', text: '栏目：' }, { type: 'input', text: '新闻直播间' }],
            [
                { type: 'fix', text: '内容：' }, { type: 'input', text: '12', class: 'time-h' }, { type: 'fix', text: ':' }, { type: 'input', text: '32', class: 'time-m' },
                { type: 'fix', text: ' 播出 ' }, { type: 'textarea', text: '' }, { type: 'fix', text: '（' }, { type: 'input', text: '' }, { type: 'fix', text: '）' }
            ],
            [{ type: 'fix', text: '【央视舆情补充】' }],
            [{ type: 'fix', text: '频道：' }, { type: 'input', text: 'CCTV2' }, { type: 'fix', text: '(' }, { type: 'input', text: '财经频道' }, { type: 'fix', text: ')' }],
            [{ type: 'fix', text: '栏目：' }, { type: 'input', text: '' }],
            [{ type: 'fix', text: '标题：' }, { type: 'input', text: '' }],
            [
                { type: 'fix', text: '播出时间：' }, { type: 'input', text: '20260528', class: 'broadcast-date' }, { type: 'fix', text: ' ' },
                { type: 'input', text: '12', class: 'time-h' }, { type: 'fix', text: ':' },
                { type: 'input', text: '34', class: 'time-m' }, { type: 'fix', text: ':' },
                { type: 'input', text: '33', class: 'time-s' },
                { type: 'fix', text: ' - ' },
                { type: 'input', text: '12', class: 'time-h' }, { type: 'fix', text: ':' },
                { type: 'input', text: '33', class: 'time-m' }, { type: 'fix', text: ':' },
                { type: 'input', text: '34', class: 'time-s' }
            ],
            [
                { type: 'fix', text: '新闻时长：' }, { type: 'input', text: '03', class: 'time-m' }, { type: 'fix', text: "'" },
                { type: 'input', text: '20', class: 'time-s' }, { type: 'fix', text: '"' }
            ],
            [
                { type: 'fix', text: '露出时长：' }, { type: 'input', text: '03', class: 'time-m' }, { type: 'fix', text: "'" },
                { type: 'input', text: '02', class: 'time-s' }, { type: 'fix', text: '"' }
            ],
            [{ type: 'fix', text: '记者：' }, { type: 'input', text: '' }],
            [{ type: 'fix', text: '摘要：' }, { type: 'textarea', text: '' }, { type: 'fix', text: '（' }, { type: 'input', text: '' }, { type: 'fix', text: '）' }],
            [{ type: 'fix', text: '链接：' }, { type: 'textarea', text: '' }]
        ],

        // ========== 初始化 ==========
        init(container, App) {
            this.App = App;
            this.container = container;
            this.loadTemplates();
            this.render();
        },

        activate(App) {
            this.App = App;
            this.render();
        },

        destroy() {
            if (this.container) this.container.innerHTML = '';
        },

        // ========== 模板数据管理 ==========
        loadTemplates() {
            this.userTemplates = this.App.api.storageGet('user_templates') || [];
        },

        saveTemplates() {
            this.App.api.storageSet('user_templates', this.userTemplates);
        },

        // ========== 渲染 ==========
        render() {
            const con = this.container;
            con.innerHTML = '';

            // 如果正在编辑已有模板，加载模板数据
            if (this.editingTemplateId) {
                const tpl = this.userTemplates.find(t => t.id === this.editingTemplateId);
                if (tpl) {
                    this.nowTemp = JSON.parse(JSON.stringify(tpl.components));
                    this.templateName = tpl.name;
                }
            }

            // 如果没有模板数据，使用默认模板
            if (this.nowTemp.length === 0) {
                this.nowTemp = JSON.parse(JSON.stringify(this.defaultTemplate));
            }

            let html = `
                <div style="display:flex; gap:15px; margin-bottom:15px; align-items:center;">
                    <input type="text" id="templateNameInput" placeholder="模板名称" value="${this.App.api.escapeHtml(this.templateName)}" style="flex:1;padding:6px 10px;border:1px solid #dcdcdc;border-radius:4px;font-size:14px;">
                    <button class="btn btn-success" id="saveTemplateBtn">💾 保存模板</button>
                    <button class="btn btn-warning" id="resetTemplateBtn">🔄 恢复默认</button>
                    <button class="btn btn-light" id="newTemplateBtn">➕ 新建模板</button>
                    <button class="btn ${this.editMode ? 'btn-success' : 'btn-warning'}" id="toggleEditBtn">${this.editMode ? '✅ 退出编辑' : '🔧 编辑模式'}</button>
                </div>
                <div class="builder-toolbar" style="margin-bottom:10px; ${this.editMode ? '' : 'display:none;'}">
                    <button class="btn btn-primary btn-sm" id="addRowBtn">➕ 添加行</button>
                    <button class="btn btn-light btn-sm" id="addFixBtn">📝 添加文字</button>
                    <button class="btn btn-light btn-sm" id="addInputBtn">📋 添加输入框</button>
                    <button class="btn btn-light btn-sm" id="addTextareaBtn">📄 添加文本框</button>
                </div>
                <div id="builderRows" style="margin-bottom:15px;"></div>
                <h4>已保存的模板</h4>
                <div id="savedTemplates" style="margin-bottom:15px;"></div>
            `;
            con.innerHTML = html;

            this._renderRows();
            this._renderSavedTemplates();
            this._bindEvents(con);
        },

        // ========== 渲染行 ==========
        _renderRows() {
            const container = this.container.querySelector('#builderRows');
            if (!container) return;

            container.innerHTML = this.nowTemp.map((row, rowIdx) => {
                // 确定该行的角色
                let rowRole = '';
                if (row.length > 0 && row[0].type === 'fix') {
                    const t = row[0].text;
                    if (t.startsWith('频道')) rowRole = '频道';
                    else if (t.startsWith('栏目')) rowRole = '栏目';
                    else if (t.startsWith('内容')) rowRole = '内容';
                    else if (t.startsWith('标题')) rowRole = '标题';
                }

                let channelInputCount = 0;
                const itemsHTML = row.map((item, itemIdx) => {
                    let fieldAttr = '';
                    if (rowRole === '频道') {
                        if (item.type === 'input') {
                            if (channelInputCount === 0) fieldAttr = ' data-field="channelNum"';
                            else if (channelInputCount === 1) fieldAttr = ' data-field="channelName"';
                            channelInputCount++;
                        }
                    } else if (rowRole === '栏目' && item.type === 'input') {
                        fieldAttr = ' data-field="column"';
                    } else if (rowRole === '内容' && item.type === 'textarea') {
                        fieldAttr = ' data-field="content"';
                    } else if (rowRole === '标题' && item.type === 'input') {
                        fieldAttr = ' data-field="title"';
                    }

                    if (item.type === 'fix') {
                        return `<span class="mod-item">
                            <span class="fix-text" contenteditable="${this.editMode}" data-row="${rowIdx}" data-item="${itemIdx}">${this.App.api.escapeHtml(item.text)}</span>
                            ${this.editMode ? `<button class="item-del" data-row="${rowIdx}" data-item="${itemIdx}">×</button>` : ''}
                        </span>`;
                    } else if (item.type === 'input') {
                        const cls = item.class || '';
                        const isTime = cls.includes('time-');
                        const ml = isTime ? ' maxlength="2" ' : '';
                        return `<span class="mod-item">
                            <input type="text" class="input-single ${cls}" value="${this.App.api.escapeHtml(item.text||'')}" data-row="${rowIdx}" data-item="${itemIdx}"${fieldAttr}${ml} placeholder="占位符" readonly>
                            ${this.editMode ? `<button class="item-del" data-row="${rowIdx}" data-item="${itemIdx}">×</button>` : ''}
                        </span>`;
                    } else if (item.type === 'textarea') {
                        return `<span class="mod-item">
                            <textarea class="textarea-mod" data-row="${rowIdx}" data-item="${itemIdx}"${fieldAttr} readonly>${this.App.api.escapeHtml(item.text||'')}</textarea>
                            ${this.editMode ? `<button class="item-del" data-row="${rowIdx}" data-item="${itemIdx}">×</button>` : ''}
                        </span>`;
                    }
                    return '';
                }).join('');

                return `<div class="module-row" data-row="${rowIdx}">
                    ${itemsHTML}
                    ${this.editMode ? `<button class="btn btn-danger btn-sm row-del-btn" data-row="${rowIdx}" style="margin-left:auto;">🗑️ 删行</button>` : ''}
                </div>`;
            }).join('');
        },

        // ========== 渲染已保存模板列表 ==========
        _renderSavedTemplates() {
            const container = this.container.querySelector('#savedTemplates');
            if (!container) return;

            if (this.userTemplates.length === 0) {
                container.innerHTML = '<p style="color:#999;">暂无已保存的模板</p>';
                return;
            }

            container.innerHTML = this.userTemplates.map(tpl => `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:8px;margin-bottom:4px;background:#f9f9f9;border:1px solid #eee;border-radius:4px;">
                    <span>📄 ${this.App.api.escapeHtml(tpl.name)}</span>
                    <div>
                        <button class="btn btn-light btn-sm edit-tpl-btn" data-id="${tpl.id}">✎ 编辑</button>
                        <button class="btn btn-danger btn-sm del-tpl-btn" data-id="${tpl.id}">🗑️ 删除</button>
                    </div>
                </div>
            `).join('');
        },

        // ========== 事件绑定 ==========
        _bindEvents(con) {
            // 模板名称输入
            con.querySelector('#templateNameInput').addEventListener('input', (e) => {
                this.templateName = e.target.value;
            });

            // 切换编辑模式
            con.querySelector('#toggleEditBtn').addEventListener('click', () => {
                this.editMode = !this.editMode;
                this.render();
            });

            // 保存模板
            con.querySelector('#saveTemplateBtn').addEventListener('click', () => this._saveTemplate());

            // 恢复默认
            con.querySelector('#resetTemplateBtn').addEventListener('click', () => {
                if (!confirm('确定恢复默认模板？当前修改将丢失！')) return;
                this.nowTemp = JSON.parse(JSON.stringify(this.defaultTemplate));
                this.templateName = '';
                this.editingTemplateId = null;
                this.editMode = false;
                this.render();
            });

            // 新建模板
            con.querySelector('#newTemplateBtn').addEventListener('click', () => {
                this.nowTemp = [[]];
                this.templateName = '';
                this.editingTemplateId = null;
                this.editMode = true;
                this.render();
            });

            // 编辑模式下的按钮
            if (this.editMode) {
                con.querySelector('#addRowBtn').addEventListener('click', () => {
                    this.nowTemp.push([{ type: 'fix', text: '新文字' }]);
                    this._renderRows();
                    this._bindRowEvents();
                });

                con.querySelector('#addFixBtn').addEventListener('click', () => {
                    if (this.nowTemp.length === 0) this.nowTemp.push([]);
                    this.nowTemp[this.nowTemp.length - 1].push({ type: 'fix', text: '新文字' });
                    this._renderRows();
                    this._bindRowEvents();
                });

                con.querySelector('#addInputBtn').addEventListener('click', () => {
                    if (this.nowTemp.length === 0) this.nowTemp.push([]);
                    this.nowTemp[this.nowTemp.length - 1].push({ type: 'input', text: '' });
                    this._renderRows();
                    this._bindRowEvents();
                });

                con.querySelector('#addTextareaBtn').addEventListener('click', () => {
                    if (this.nowTemp.length === 0) this.nowTemp.push([]);
                    this.nowTemp[this.nowTemp.length - 1].push({ type: 'textarea', text: '' });
                    this._renderRows();
                    this._bindRowEvents();
                });
            }

            this._bindRowEvents();
            this._bindTemplateEvents();
        },

        // ========== 行事件绑定 ==========
        _bindRowEvents() {
            const con = this.container;

            // 固定文字编辑
            con.querySelectorAll('.fix-text').forEach(el => {
                el.addEventListener('blur', () => {
                    const row = parseInt(el.dataset.row);
                    const item = parseInt(el.dataset.item);
                    if (!isNaN(row) && !isNaN(item) && this.nowTemp[row] && this.nowTemp[row][item]) {
                        this.nowTemp[row][item].text = el.innerText;
                    }
                });
            });

            // 删除组件
            con.querySelectorAll('.item-del').forEach(el => {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const row = parseInt(el.dataset.row);
                    const item = parseInt(el.dataset.item);
                    if (!isNaN(row) && !isNaN(item) && this.nowTemp[row]) {
                        this.nowTemp[row].splice(item, 1);
                        if (this.nowTemp[row].length === 0) this.nowTemp.splice(row, 1);
                        this._renderRows();
                        this._bindRowEvents();
                    }
                });
            });

            // 删除行
            con.querySelectorAll('.row-del-btn').forEach(el => {
                el.addEventListener('click', () => {
                    const row = parseInt(el.dataset.row);
                    if (!isNaN(row)) {
                        this.nowTemp.splice(row, 1);
                        this._renderRows();
                        this._bindRowEvents();
                    }
                });
            });
        },

        // ========== 已保存模板事件 ==========
        _bindTemplateEvents() {
            const con = this.container;

            // 编辑已保存模板
            con.querySelectorAll('.edit-tpl-btn').forEach(el => {
                el.addEventListener('click', () => {
                    const id = el.dataset.id;
                    const tpl = this.userTemplates.find(t => t.id === id);
                    if (tpl) {
                        this.nowTemp = JSON.parse(JSON.stringify(tpl.components));
                        this.templateName = tpl.name;
                        this.editingTemplateId = tpl.id;
                        this.editMode = true;
                        this.render();
                    }
                });
            });

            // 删除已保存模板
            con.querySelectorAll('.del-tpl-btn').forEach(el => {
                el.addEventListener('click', () => {
                    if (!confirm('确定删除该模板？')) return;
                    const id = el.dataset.id;
                    this.userTemplates = this.userTemplates.filter(t => t.id !== id);
                    this.saveTemplates();
                    if (this.editingTemplateId === id) {
                        this.nowTemp = JSON.parse(JSON.stringify(this.defaultTemplate));
                        this.templateName = '';
                        this.editingTemplateId = null;
                        this.editMode = false;
                    }
                    this.render();
                });
            });
        },

        // ========== 保存模板 ==========
        _saveTemplate() {
            const name = this.templateName.trim() || '未命名模板';
            const templateData = {
                id: this.editingTemplateId || ('tpl_' + Date.now()),
                name: name,
                components: JSON.parse(JSON.stringify(this.nowTemp)),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            if (this.editingTemplateId) {
                const idx = this.userTemplates.findIndex(t => t.id === this.editingTemplateId);
                if (idx >= 0) this.userTemplates[idx] = templateData;
            } else {
                this.userTemplates.push(templateData);
                this.editingTemplateId = templateData.id;
            }

            this.saveTemplates();
            if (this.App.refreshCustomTemplates) {
                this.App.refreshCustomTemplates();
            }
            this._renderSavedTemplates();
            message(`模板 "${name}" 已保存！`, 'success');
        }
    };

    // 注册模块
    window.__modules = window.__modules || {};
    window.__modules['build'] = module;

})(window);