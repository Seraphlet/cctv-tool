/**
 * yuqing-module.js - 日常/全套舆情生成器模块（完整版）
 * 包含所有功能：智能解析、字段映射、标点替换、编辑模式、审阅弹窗、Title预设、快捷格式化等
 * 新增：全套模板“全文”后增加括号输入框（与“摘要”结构一致）
 */
(function(window) {
    'use strict';

    const module = {
        name: 'yuqing',

        nowTemp: [],
        lastTipValues: { channelNum: '', channelName: '', columnName: '', broadcastText: '' },
        lineList: [],
        _eventUnsubscribers: [],
        syncTimer: null,

        // 预设频道和栏目
        presets: {
            channels: [
                { code: 'CCTV1', name: '综合频道' },
                { code: 'CCTV2', name: '财经频道' },
                { code: 'CCTV12', name: '社会与法频道' },
                { code: 'CCTV13', name: '新闻频道' }
            ],
            columns: ['朝闻天下', '共同关注', '新闻直播间', '正点财经', '天下财经','法治在线','经济信息联播', '中国法治观察']
        },

        // 审阅开关（默认开启）
        _reviewEnabled: true,
        // 标点替换模式：off / en / cn
        _punctuationMode: 'off',
        // 字段标签映射（用户自定义）
        _fieldLabelMap: {},

        // 默认字段标签列表（用于设置面板）
        _defaultFieldLabels: [
            '频道：', '栏目：', '内容：', '标题：', '播出时间：',
            '新闻时长：', '露出时长：', '记者：', '摘要：', '全文：',
            '链接：', '微盘：'
        ],

        // 标点映射表（中文→英文）
        _cnToEnPunct: {
            '\uff0c': ',', '\u3002': '.', '\uff1f': '?', '\uff01': '!',
            '\uff1a': ':', '\uff1b': ';', '\u201c': '"', '\u201d': '"',
            '\u2018': "'", '\u2019': "'", '\uff08': '(', '\uff09': ')',
            '\u3010': '[', '\u3011': ']', '\u300a': '<', '\u300b': '>'
        },
        _enToCnPunct: null,

        // 初始模板
        initTemplate: {
            richang: [
                [{ type: 'fix', text: '【央视舆情提示】' }],
                [{ type: 'fix', text: '频道：' }, { type: 'input', text: 'CCTV13' }, { type: 'fix', text: '(' }, { type: 'input', text: '新闻频道' }, { type: 'fix', text: ')' }],
                [{ type: 'fix', text: '栏目：' }, { type: 'input', text: '新闻直播间' }, { type: 'fix', text: '（' }, { type: 'input', text: '8点档' }, { type: 'fix', text: '）' }],
                [{ type: 'fix', text: '内容：' }, { type: 'input', text: '12', class: 'time-h' }, { type: 'fix', text: ':' }, { type: 'input', text: '32', class: 'time-m' }, { type: 'fix', text: ' 播出 ' }, { type: 'textarea', text: '' }, { type: 'fix', text: '（' }, { type: 'input', text: '' }, { type: 'fix', text: '）' }],
                [{ type: 'fix', text: '【央视舆情补充】' }],
                [{ type: 'fix', text: '频道：' }, { type: 'input', text: 'CCTV13' }, { type: 'fix', text: '(' }, { type: 'input', text: '新闻频道' }, { type: 'fix', text: ')' }],
                [{ type: 'fix', text: '栏目：' }, { type: 'input', text: '新闻直播间' }, { type: 'fix', text: '（' }, { type: 'input', text: '8点档' }, { type: 'fix', text: '）' }],
                [{ type: 'fix', text: '标题：' }, { type: 'input', text: '' }],
                [{ type: 'fix', text: '播出时间：' }, { type: 'input', text: '20260528', class: 'broadcast-date' }, { type: 'fix', text: ' ' }, { type: 'input', text: '12', class: 'time-h' }, { type: 'fix', text: ':' }, { type: 'input', text: '34', class: 'time-m' }, { type: 'fix', text: ':' }, { type: 'input', text: '33', class: 'time-s' }, { type: 'fix', text: ' - ' }, { type: 'input', text: '12', class: 'time-h' }, { type: 'fix', text: ':' }, { type: 'input', text: '33', class: 'time-m' }, { type: 'fix', text: ':' }, { type: 'input', text: '34', class: 'time-s' }],
                [{ type: 'fix', text: '新闻时长：' }, { type: 'input', text: '03', class: 'time-m' }, { type: 'fix', text: "'" }, { type: 'input', text: '20', class: 'time-s' }, { type: 'fix', text: '"' }],
                [{ type: 'fix', text: '露出时长：' }, { type: 'input', text: '03', class: 'time-m' }, { type: 'fix', text: "'" }, { type: 'input', text: '02', class: 'time-s' }, { type: 'fix', text: '"' }],
                [{ type: 'fix', text: '记者：' }, { type: 'input', text: '' }],
                [{ type: 'fix', text: '摘要：' }, { type: 'textarea', text: '' }, { type: 'fix', text: '（' }, { type: 'input', text: '' }, { type: 'fix', text: '）' }],
                [{ type: 'fix', text: '链接：' }, { type: 'textarea', text: '' }]
            ],
            quantao: [
                [{ type: 'fix', text: '【央视舆情提示】' }],
                [{ type: 'fix', text: '频道：' }, { type: 'input', text: 'CCTV13' }, { type: 'fix', text: '(' }, { type: 'input', text: '新闻频道' }, { type: 'fix', text: ')' }],
                [{ type: 'fix', text: '栏目：' }, { type: 'input', text: '新闻直播间' }, { type: 'fix', text: '（' }, { type: 'input', text: '8点档' }, { type: 'fix', text: '）' }],
                [{ type: 'fix', text: '内容：' }, { type: 'input', text: '12', class: 'time-h' }, { type: 'fix', text: ':' }, { type: 'input', text: '32', class: 'time-m' }, { type: 'fix', text: ' 播出 ' }, { type: 'textarea', text: '' }, { type: 'fix', text: '（' }, { type: 'input', text: '' }, { type: 'fix', text: '）' }],
                [{ type: 'fix', text: '【央视舆情补充】' }],
                [{ type: 'fix', text: '频道：' }, { type: 'input', text: 'CCTV13' }, { type: 'fix', text: '(' }, { type: 'input', text: '新闻频道' }, { type: 'fix', text: ')' }],
                [{ type: 'fix', text: '栏目：' }, { type: 'input', text: '新闻直播间' }, { type: 'fix', text: '（' }, { type: 'input', text: '8点档' }, { type: 'fix', text: '）' }],
                [{ type: 'fix', text: '标题：' }, { type: 'input', text: '' }],
                [{ type: 'fix', text: '播出时间：' }, { type: 'input', text: '20260528', class: 'broadcast-date' }, { type: 'fix', text: ' ' }, { type: 'input', text: '12', class: 'time-h' }, { type: 'fix', text: ':' }, { type: 'input', text: '34', class: 'time-m' }, { type: 'fix', text: ':' }, { type: 'input', text: '33', class: 'time-s' }, { type: 'fix', text: ' - ' }, { type: 'input', text: '12', class: 'time-h' }, { type: 'fix', text: ':' }, { type: 'input', text: '33', class: 'time-m' }, { type: 'fix', text: ':' }, { type: 'input', text: '34', class: 'time-s' }],
                [{ type: 'fix', text: '新闻时长：' }, { type: 'input', text: '03', class: 'time-m' }, { type: 'fix', text: "'" }, { type: 'input', text: '48', class: 'time-s' }, { type: 'fix', text: '"' }],
                [{ type: 'fix', text: '露出时长：' }, { type: 'input', text: '03', class: 'time-m' }, { type: 'fix', text: "'" }, { type: 'input', text: '48', class: 'time-s' }, { type: 'fix', text: '"' }],
                [{ type: 'fix', text: '记者：' }, { type: 'input', text: '' }],
                [{ type: 'fix', text: '全文：' }, { type: 'textarea', text: '' }, { type: 'fix', text: '（' }, { type: 'input', text: '' }, { type: 'fix', text: '）' }],
                [{ type: 'fix', text: '链接：' }, { type: 'textarea', text: '' }],
                [{ type: 'fix', text: '微盘：' }, { type: 'input', text: '' }]
            ]
        },

        // ========== 生命周期 ==========
        init(container, App) {
            this.App = App;
            this.container = container;
            this._defaultPresets = {
                channels: this.presets.channels.map(c => ({ ...c })),
                columns: this.presets.columns.slice()
            };
            this._loadPresets();
            this._loadSettings();
            this._loadTemplate();
            this._bindGlobalEvents();
            this.render();
            this._createTitleFloatingBtn();
            this._unsubSubTab = App.EventBus.on('subTabChange', () => {
                this._loadTemplate();
                this.updateTitleKeywords();
                this.render();
                this.updatePreview();
            });
        },

        activate(App) {
            this.App = App;
            this._defaultPresets = {
                channels: this.presets.channels.map(c => ({ ...c })),
                columns: this.presets.columns.slice()
            };
            this._loadPresets();
            this._loadSettings();
            this._loadTemplate();
            this.updateTitleKeywords();
            this.render();
            this.updatePreview();
        },

        destroy() {
            if (this._unsubSubTab) this._unsubSubTab();
            this._eventUnsubscribers.forEach(fn => fn());
            this._globalEventsBound = false;
            if (this.syncTimer) clearTimeout(this.syncTimer);
            const floatBtn = document.getElementById('titleFloatBtn');
            const popup = document.getElementById('titlePopup');
            if (floatBtn) floatBtn.remove();
            if (popup) popup.remove();
            if (this.container) this.container.innerHTML = '';
        },

        // ========== 设置加载/保存 ==========
        _loadSettings() {
            const saved = this.App.api.storageGet('yuqing_settings');
            if (saved) {
                this._reviewEnabled = saved.reviewEnabled !== undefined ? saved.reviewEnabled : true;
                this._fieldLabelMap = saved.fieldLabelMap || {};
                this._punctuationMode = saved.punctuationMode || 'off';
            }
        },

        _saveSettings() {
            this.App.api.storageSet('yuqing_settings', {
                reviewEnabled: this._reviewEnabled,
                fieldLabelMap: this._fieldLabelMap,
                punctuationMode: this._punctuationMode
            });
        },

        _showToast(msg) {
            const toast = document.createElement('div');
            toast.textContent = msg;
            Object.assign(toast.style, {
                position: 'fixed', bottom: '30px', left: '50%',
                transform: 'translateX(-50%)', background: '#333',
                color: '#fff', padding: '8px 20px', borderRadius: '20px',
                fontSize: '14px', zIndex: '9999', opacity: '0.9',
                transition: 'opacity 0.3s'
            });
            document.body.appendChild(toast);
            setTimeout(() => { toast.style.opacity = '0'; }, 1500);
            setTimeout(() => toast.remove(), 2000);
        },

        // ========== 标点转换 ==========
        _applyPunctuation(text) {
            if (this._punctuationMode === 'off') return text;
            if (!this._enToCnPunct) {
                this._enToCnPunct = {};
                for (const [cn, en] of Object.entries(this._cnToEnPunct)) {
                    this._enToCnPunct[en] = cn;
                }
            }
            const map = this._punctuationMode === 'en' ? this._cnToEnPunct : this._enToCnPunct;
            const lines = text.split('\n');
            const resultLines = lines.map(line => {
                if (/^【.*】$/.test(line.trim())) return line;
                let result = line;
                for (const [from, to] of Object.entries(map)) {
                    result = result.split(from).join(to);
                }
                return result;
            });
            return resultLines.join('\n');
        },

        _copyText(text) {
            navigator.clipboard.writeText(text).then(() => {
                this._showToast('已复制');
            }).catch(() => {
                const ta = document.createElement('textarea');
                ta.value = text;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                this._showToast('已复制');
            });
        },

        // ========== 设置面板 ==========
        _openSettings() {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:10001;display:flex;align-items:center;justify-content:center;';
            const content = document.createElement('div');
            content.style.cssText = 'background:#fff;border-radius:12px;padding:24px;min-width:400px;max-width:600px;box-shadow:0 8px 30px rgba(0,0,0,0.3);color-scheme:light only;max-height:80vh;overflow-y:auto;';

            let labelsHtml = '';
            this._defaultFieldLabels.forEach(label => {
                const currentVal = this._fieldLabelMap[label] || '';
                labelsHtml += `
                    <div style="margin-bottom:8px;display:flex;align-items:center;gap:8px;">
                        <span style="width:70px;font-size:13px;">${label}</span>
                        <span>→</span>
                        <input type="text" class="label-map-input" data-original="${label}" value="${currentVal}" style="flex:1;padding:4px 8px;border:1px solid #ddd;border-radius:4px;" placeholder="保持默认">
                    </div>`;
            });

            content.innerHTML = `
                <h3 style="margin-bottom:15px;">设置</h3>
                <div style="margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;">
                    <span>复制前审阅</span>
                    <label class="switch"><input type="checkbox" id="reviewSwitch" ${this._reviewEnabled?'checked':''}><span class="slider"></span></label>
                </div>
                <div style="margin-bottom:16px;">
                    <strong style="font-size:13px;">复制标点替换</strong>
                    <div style="margin-top:5px;">
                        <select id="punctModeSelect" style="padding:4px;border:1px solid #ddd;border-radius:4px;">
                            <option value="off" ${this._punctuationMode==='off'?'selected':''}>关闭</option>
                            <option value="en" ${this._punctuationMode==='en'?'selected':''}>英文标点</option>
                            <option value="cn" ${this._punctuationMode==='cn'?'selected':''}>中文标点</option>
                        </select>
                    </div>
                </div>
                <div style="margin-bottom:16px;">
                    <strong style="font-size:13px;">自定义字段标签</strong>
                    <div style="margin-top:10px;font-size:12px;color:#666;">修改后智能解析将同步识别新标签</div>
                    <div id="labelMapContainer" style="margin-top:8px;">${labelsHtml}</div>
                </div>
                <div style="text-align:right;">
                    <button class="btn btn-light" id="closeSettingsBtn">关闭</button>
                </div>
                <style>
                    .switch { position:relative; display:inline-block; width:44px; height:24px; }
                    .switch input { opacity:0; width:0; height:0; }
                    .slider { position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0; background-color:#ccc; transition:.3s; border-radius:24px; }
                    .slider:before { position:absolute; content:""; height:18px; width:18px; left:3px; bottom:3px; background-color:white; transition:.3s; border-radius:50%; }
                    input:checked + .slider { background-color:#1677ff; }
                    input:checked + .slider:before { transform:translateX(20px); }
                </style>
            `;
            overlay.appendChild(content);
            document.body.appendChild(overlay);

            content.querySelector('#reviewSwitch').addEventListener('change', (e) => {
                this._reviewEnabled = e.target.checked;
                this._saveSettings();
            });
            content.querySelector('#punctModeSelect').addEventListener('change', (e) => {
                this._punctuationMode = e.target.value;
                this._saveSettings();
            });
            content.querySelector('#closeSettingsBtn').addEventListener('click', () => overlay.remove());
            overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

            content.querySelectorAll('.label-map-input').forEach(inp => {
                inp.addEventListener('input', () => {
                    const original = inp.dataset.original;
                    const newVal = inp.value.trim();
                    if (newVal) {
                        this._fieldLabelMap[original] = newVal;
                    } else {
                        delete this._fieldLabelMap[original];
                    }
                    this._saveSettings();
                });
            });
        },

        // ========== 标签映射辅助 ==========
        _getDisplayLabel(originalText) {
            return this._fieldLabelMap[originalText] || originalText;
        },

        _getAllParseLabels() {
            const labels = [...this._defaultFieldLabels];
            for (const key in this._fieldLabelMap) {
                const val = this._fieldLabelMap[key];
                if (val && !labels.includes(val)) labels.push(val);
            }
            return labels;
        },

        // ========== 预设数据 ==========
        _loadPresets() {
            const saved = this.App.api.storageGet('yuqing_presets');
            if (saved) this.presets = saved;
            else this._savePresets();
        },
        _savePresets() { this.App.api.storageSet('yuqing_presets', this.presets); },

        // ========== 模板加载（含全文括号补全） ==========
        _loadTemplate() {
            if (this.App.state.activeTemplateData) {
                const tpl = this.App.state.activeTemplateData;
                this.nowTemp = tpl.components.map(row => row.map(comp => {
                    switch (comp.type) {
                        case 'fix': case 'symbol': return { type: 'fix', text: comp.text || '' };
                        case 'input': return { type: 'input', text: comp.text || '', width: comp.width };
                        case 'textarea': return { type: 'textarea', text: comp.text || '', width: comp.width, height: comp.height };
                        case 'time-h': return { type: 'input', text: comp.text || '12', class: 'time-h' };
                        case 'time-m': return { type: 'input', text: comp.text || '34', class: 'time-m' };
                        case 'time-s': return { type: 'input', text: comp.text || '33', class: 'time-s' };
                        case 'date': return { type: 'input', text: comp.autoToday ? this.App.api.getCurrentDateStr() : (comp.text || ''), class: 'broadcast-date' };
                        default: return { type: 'input', text: comp.text || '' };
                    }
                }));
            } else {
                const currMode = this.App.state.currM || 'richang';
                const key = 'main_' + currMode;
                const saved = this.App.api.storageGet(key);
                if (saved) {
                    this.nowTemp = saved;
                } else {
                    const templateKey = (currMode === 'richang') ? 'richang' : 'quantao';
                    this.nowTemp = JSON.parse(JSON.stringify(this.initTemplate[templateKey]));
                }
            }

            // 自动补全“全文”行的括号结构（仅当全文行缺少括号时）
            this.nowTemp.forEach(row => {
                if (row.length > 0 && row[0].type === 'fix' && row[0].text === '全文：') {
                    if (row.length < 5) {
                        const hasTextarea = row.some(item => item.type === 'textarea');
                        if (hasTextarea) {
                            const newRow = [];
                            let textareaFound = false;
                            row.forEach(item => {
                                if (item.type === 'fix' && item.text === '全文：') {
                                    newRow.push(item);
                                } else if (item.type === 'textarea' && !textareaFound) {
                                    newRow.push(item);
                                    textareaFound = true;
                                } else if (item.type === 'fix' && (item.text === '（' || item.text === '）')) {
                                    // 忽略旧的括号
                                } else if (item.type === 'input' && textareaFound) {
                                    // 忽略旧的input，后面会补
                                } else {
                                    newRow.push(item);
                                }
                            });
                            newRow.push({ type: 'fix', text: '（' });
                            newRow.push({ type: 'input', text: '' });
                            newRow.push({ type: 'fix', text: '）' });
                            row.splice(0, row.length, ...newRow);
                        }
                    }
                }
            });

            this.updateTitleKeywords();
            this.lastTipValues = { channelNum: '', channelName: '', columnName: '', broadcastText: '' };
        },

        save() {
            this.syncUIData();
            const key = this.App.state.activeTemplateData ? 'custom_' + this.App.state.activeTemplateData.id : 'main_' + (this.App.state.currM || 'richang');
            this.App.api.storageSet(key, this.nowTemp);
        },

        updateTitleKeywords() {
            const keyword = this.App.state.currS === 'yuqing' ? '舆情' : '正面';
            this.nowTemp.forEach(row => {
                if (row.length > 0 && row[0].type === 'fix') {
                    const txt = row[0].text;
                    if (txt.includes('提示】')) row[0].text = `【央视${keyword}提示】`;
                    else if (txt.includes('补充】')) row[0].text = `【央视${keyword}补充】`;
                }
            });
        },

        // ========== 渲染 ==========
        render() {
            const con = this.container;
            con.innerHTML = '';

            const parseArea = document.createElement('div');
            parseArea.className = 'smart-parse-area';
            parseArea.style.cssText = 'margin-bottom:20px;padding:15px;background:#f0f7ff;border:1px solid #b3d8ff;border-radius:8px;';
            parseArea.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                    <span style="font-weight:bold;font-size:14px;">🤖 智能解析粘贴</span>
                    <div style="display:flex;gap:10px;align-items:center;">
                        <span id="parseToggleIcon" style="cursor:pointer;font-size:16px;">▶ 展开</span>
                        <span id="settingsBtn" style="cursor:pointer;font-size:18px;margin-left:8px;" title="设置">⚙️</span>
                    </div>
                </div>
                <div id="parseBody" style="display:none;">
                    <textarea id="smartParseInput" placeholder="粘贴完整文本，自动解析填充到对应字段..." style="width:100%;height:150px;padding:10px;border:1px solid #ddd;border-radius:4px;font-size:13px;resize:vertical;"></textarea>
                    <div style="margin-top:10px;display:flex;gap:10px;">
                        <button class="btn btn-primary" id="smartParseBtn" style="font-size:13px;">🔍 解析并填充</button>
                        <button class="btn btn-light" id="clearParseBtn" style="font-size:13px;">🗑️ 清空</button>
                    </div>
                </div>
            `;
            con.appendChild(parseArea);

            const toggleIcon = parseArea.querySelector('#parseToggleIcon');
            const parseBody = parseArea.querySelector('#parseBody');
            toggleIcon.addEventListener('click', () => {
                if (parseBody.style.display === 'none' || parseBody.style.display === '') {
                    parseBody.style.display = 'block';
                    toggleIcon.innerHTML = '▼ 折叠';
                } else {
                    parseBody.style.display = 'none';
                    toggleIcon.innerHTML = '▶ 展开';
                }
            });
            parseArea.querySelector('#smartParseBtn').addEventListener('click', () => {
                const text = parseArea.querySelector('#smartParseInput').value;
                if (text.trim()) this._smartParse(text);
            });
            parseArea.querySelector('#clearParseBtn').addEventListener('click', () => {
                parseArea.querySelector('#smartParseInput').value = '';
            });
            parseArea.querySelector('#settingsBtn').addEventListener('click', () => this._openSettings());

            let currentSection = 'none';
            this.nowTemp.forEach((row, rowIdx) => {
                if (row.length > 0 && row[0].type === 'fix') {
                    const txt = row[0].text;
                    if (txt.includes('提示】')) currentSection = 'tip';
                    else if (txt.includes('补充】')) currentSection = 'add';
                }

                let rowRole = '';
                if (row.length > 0 && row[0].type === 'fix') {
                    const t = row[0].text;
                    if (t.startsWith('频道')) rowRole = '频道';
                    else if (t.startsWith('栏目')) rowRole = '栏目';
                    else if (t.startsWith('内容')) rowRole = '内容';
                    else if (t.startsWith('标题')) rowRole = '标题';
                }

                const rowDiv = document.createElement('div');
                rowDiv.className = 'module-row';
                rowDiv.dataset.section = currentSection;
                rowDiv.dataset.role = rowRole;

                let channelInputCount = 0;
                let columnInputCount = 0;
                row.forEach((item, itemIdx) => {
                    const itemDiv = document.createElement('div');
                    itemDiv.className = 'mod-item';
                    let fieldAttr = '';
                    if (rowRole === '频道') {
                        if (item.type === 'input') {
                            if (channelInputCount === 0) fieldAttr = ' data-field="channelNum"';
                            else if (channelInputCount === 1) fieldAttr = ' data-field="channelName"';
                            channelInputCount++;
                        }
                    } else if (rowRole === '栏目' && item.type === 'input') {
                        if (columnInputCount === 0) fieldAttr = ' data-field="column"';
                        else if (columnInputCount === 1) fieldAttr = ' data-field="columnBracket"';
                        columnInputCount++;
                    } else if (rowRole === '内容' && item.type === 'textarea') {
                        fieldAttr = ' data-field="content"';
                    } else if (rowRole === '标题' && item.type === 'input') {
                        fieldAttr = ' data-field="title"';
                    }

                    if (item.type === 'fix') {
                        if (this.App.state.editMode) {
                            const input = document.createElement('input');
                            input.type = 'text';
                            input.className = 'input-single fix-edit';
                            input.value = item.text;
                            const tempSpan = document.createElement('span');
                            tempSpan.style.visibility = 'hidden';
                            tempSpan.style.position = 'absolute';
                            tempSpan.style.whiteSpace = 'pre';
                            tempSpan.textContent = item.text;
                            document.body.appendChild(tempSpan);
                            const width = tempSpan.offsetWidth + 20;
                            document.body.removeChild(tempSpan);
                            input.style.width = width + 'px';
                            input.dataset.row = rowIdx;
                            input.dataset.item = itemIdx;
                            input.addEventListener('input', (e) => {
                                this.nowTemp[rowIdx][itemIdx].text = e.target.value;
                                this.updatePreview();
                                input.style.width = (e.target.value.length * 10 + 20) + 'px';
                            });
                            itemDiv.appendChild(input);
                        } else {
                            const displayText = this._getDisplayLabel(item.text);
                            itemDiv.innerHTML = `<span class="fix-text" data-row="${rowIdx}" data-item="${itemIdx}">${this.App.api.escapeHtml(displayText)}</span>`;
                        }
                    } else if (item.type === 'input') {
                        const cls = item.class || '';
                        const ml = (cls.includes('time-')) ? ' maxlength="2" ' : '';
                        const ws = item.width ? `style="width:${item.width}px;"` : '';
                        itemDiv.innerHTML = `<input type="text" class="input-single ${cls}" value="${this.App.api.escapeHtml(item.text||'')}" data-row="${rowIdx}" data-item="${itemIdx}" data-section="${currentSection}"${fieldAttr} ${ml} ${ws}>`;
                    } else if (item.type === 'textarea') {
                        const s = (item.width || item.height) ? `style="width:${item.width||220}px;height:${item.height||100}px;"` : '';
                        itemDiv.innerHTML = `<textarea class="textarea-mod" data-row="${rowIdx}" data-item="${itemIdx}" data-section="${currentSection}"${fieldAttr} ${s}>${this.App.api.escapeHtml(item.text||'')}</textarea>`;
                    }
                    rowDiv.appendChild(itemDiv);
                });

                if (currentSection === 'tip' && (rowRole === '频道' || rowRole === '栏目')) {
                    const tagContainer = document.createElement('div');
                    tagContainer.className = 'preset-tags-inline';
                    tagContainer.style.cssText = 'display:flex; gap:2px; margin-left:auto; align-items:center; flex-wrap:nowrap;';
                    tagContainer.dataset.targetRole = rowRole;
                    tagContainer.dataset.targetSection = currentSection;
                    rowDiv.appendChild(tagContainer);
                }

                if (row.length > 0 && row[0].type === 'fix') {
                    const txt = row[0].text;
                    if (txt.includes('提示】') || txt.includes('补充】')) {
                        const btn = document.createElement('button');
                        btn.className = 'title-copy-btn';
                        btn.textContent = '📋 复制本段';
                        btn.dataset.row = rowIdx;
                        btn.dataset.type = txt.includes('提示】') ? 'tip' : 'add';
                        rowDiv.appendChild(btn);
                    }
                }

                if (row.length > 0 && row[0].type === 'fix' && row[0].text === '播出时间：') {
                    const clearBtn = document.createElement('button');
                    clearBtn.className = 'clear-broadcast-btn';
                    clearBtn.textContent = '🧹 清空时间';
                    clearBtn.style.marginLeft = '8px';
                    clearBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const parentRow = e.currentTarget.closest('.module-row');
                        if (!parentRow) return;
                        const dateInp = parentRow.querySelector('.broadcast-date');
                        if (dateInp) { dateInp.value = this.App.api.getCurrentDateStr(); localStorage.setItem('userBroadcastDate', dateInp.value); }
                        parentRow.querySelectorAll('.time-h, .time-m, .time-s').forEach(inp => inp.value = '');
                        this.updatePreview();
                    });
                    rowDiv.appendChild(clearBtn);

                    const calcBtn = document.createElement('button');
                    calcBtn.className = 'clear-broadcast-btn';
                    calcBtn.style.marginLeft = '8px';
                    calcBtn.textContent = '⏱️ 计算时长';
                    calcBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const parentRow = e.currentTarget.closest('.module-row');
                        if (!parentRow) return;
                        const timeInputs = parentRow.querySelectorAll('.time-h, .time-m, .time-s');
                        if (timeInputs.length < 6) return;
                        const h1 = parseInt(timeInputs[0].value) || 0, m1 = parseInt(timeInputs[1].value) || 0, s1 = parseInt(timeInputs[2].value) || 0;
                        const h2 = parseInt(timeInputs[3].value) || 0, m2 = parseInt(timeInputs[4].value) || 0, s2 = parseInt(timeInputs[5].value) || 0;
                        const diffSec = Math.abs((h1*3600 + m1*60 + s1) - (h2*3600 + m2*60 + s2));
                        const diffMin = Math.floor(diffSec / 60), diffSecRem = diffSec % 60;
                        const allRows = [...this.container.querySelectorAll('.module-row')];
                        let newsRow = null;
                        for (let r of allRows) { const fix = r.querySelector('.fix-text'); if (fix && fix.innerText === '新闻时长：') { newsRow = r; break; } }
                        if (newsRow) {
                            const minInp = newsRow.querySelector('.time-m'), secInp = newsRow.querySelector('.time-s');
                            if (minInp) minInp.value = String(diffMin).padStart(2, '0');
                            if (secInp) secInp.value = String(diffSecRem).padStart(2, '0');
                        }
                        this.updatePreview();
                    });
                    rowDiv.appendChild(calcBtn);
                }

                con.appendChild(rowDiv);
            });

            this._renderAllPresetTags();
            this._insertFormatBar();
            this._bindTimeJump(con);
            this._bindTipToAddSync(con);
            this._bindRealTimePreview(con);
            this._bindContainerEvents(con);
            this._bindTitleFocusEvents(con);
            this._bindPresetEvents();
        },

        _renderAllPresetTags() {
            const containers = this.container.querySelectorAll('.preset-tags-inline');
            containers.forEach(cont => {
                const role = cont.dataset.targetRole;
                cont.innerHTML = '';
                if (role === '频道') {
                    this.presets.channels.forEach(ch => {
                        const tag = document.createElement('span');
                        tag.className = 'preset-tag';
                        tag.style.cssText = 'font-size:10px; padding:1px 5px; background:#f4f7fb; border:1px solid #d0d7e2; border-radius:10px; cursor:pointer; white-space:nowrap; user-select:none; color:#666;';
                        tag.textContent = ch.code + ' ' + ch.name;
                        tag.dataset.code = ch.code;
                        tag.dataset.name = ch.name;
                        tag.title = '点击填充频道';
                        tag.addEventListener('contextmenu', (e) => {
                            e.preventDefault();
                            if (confirm(`删除频道预设 "${ch.code} ${ch.name}"？`)) {
                                this.presets.channels = this.presets.channels.filter(c => c.code !== ch.code);
                                this._savePresets();
                                this._renderAllPresetTags();
                            }
                        });
                        cont.appendChild(tag);
                    });
                } else if (role === '栏目') {
                    this.presets.columns.forEach(col => {
                        const tag = document.createElement('span');
                        tag.className = 'preset-tag';
                        tag.style.cssText = 'font-size:10px; padding:1px 5px; background:#f4f7fb; border:1px solid #d0d7e2; border-radius:10px; cursor:pointer; white-space:nowrap; user-select:none; color:#666;';
                        tag.textContent = col;
                        tag.dataset.column = col;
                        tag.title = '点击填充栏目名';
                        tag.addEventListener('contextmenu', (e) => {
                            e.preventDefault();
                            if (confirm(`删除栏目预设 "${col}"？`)) {
                                this.presets.columns = this.presets.columns.filter(c => c !== col);
                                this._savePresets();
                                this._renderAllPresetTags();
                            }
                        });
                        cont.appendChild(tag);
                    });
                }
                const addBtn = document.createElement('button');
                addBtn.className = 'preset-add-btn';
                addBtn.style.cssText = 'font-size:10px; padding:1px 5px; background:#fff; border:1px dashed #ccc; border-radius:10px; cursor:pointer; color:#999;';
                addBtn.textContent = '+';
                addBtn.title = role === '频道' ? '添加频道预设' : '添加栏目预设';
                addBtn.addEventListener('click', () => {
                    if (role === '频道') {
                        const code = prompt('输入频道号（如 CCTV1）：');
                        if (code) {
                            const name = prompt('输入频道名（如 综合频道）：');
                            if (name) {
                                this.presets.channels.push({ code: code.trim(), name: name.trim() });
                                this._savePresets();
                                this._renderAllPresetTags();
                            }
                        }
                    } else {
                        const col = prompt('输入栏目名：');
                        if (col) {
                            this.presets.columns.push(col.trim());
                            this._savePresets();
                            this._renderAllPresetTags();
                        }
                    }
                });
                cont.appendChild(addBtn);
            });
        },

        _bindPresetEvents() {
            this.container.querySelectorAll('.preset-tags-inline[data-target-role="频道"] .preset-tag').forEach(tag => {
                tag.addEventListener('click', () => {
                    const section = tag.closest('.preset-tags-inline').dataset.targetSection;
                    const code = tag.dataset.code;
                    const name = tag.dataset.name;
                    const rows = this.container.querySelectorAll(`.module-row[data-section="${section}"][data-role="频道"]`);
                    rows.forEach(row => {
                        const inputs = row.querySelectorAll('input');
                        if (inputs.length >= 2) { inputs[0].value = code; inputs[1].value = name; inputs[1].dataset.autoFilled = 'true'; }
                    });
                    this._syncTipToAdd();
                    this.updatePreview();
                });
            });
            this.container.querySelectorAll('.preset-tags-inline[data-target-role="栏目"] .preset-tag').forEach(tag => {
                tag.addEventListener('click', () => {
                    const section = tag.closest('.preset-tags-inline').dataset.targetSection;
                    const col = tag.dataset.column;
                    const rows = this.container.querySelectorAll(`.module-row[data-section="${section}"][data-role="栏目"]`);
                    rows.forEach(row => { const inputs = row.querySelectorAll('input'); if (inputs.length >= 1) inputs[0].value = col; });
                    this._syncTipToAdd();
                    this.updatePreview();
                });
            });
            if (this.container._presetInputHandler1) this.container.removeEventListener('input', this.container._presetInputHandler1);
            if (this.container._presetInputHandler2) this.container.removeEventListener('input', this.container._presetInputHandler2);
            const presetHandler1 = (e) => {
                const inp = e.target;
                if (inp.dataset.field === 'channelNum') {
                    const row = inp.closest('.module-row');
                    const nameInp = row.querySelector('[data-field="channelName"]');
                    if (!nameInp) return;
                    if (nameInp.dataset.manualEdited === 'true') return;
                    const code = inp.value.trim();
                    const preset = this.presets.channels.find(c => c.code === code);
                    if (preset) { nameInp.value = preset.name; nameInp.dataset.autoFilled = 'true'; }
                    else { nameInp.dataset.autoFilled = ''; }
                    this.updatePreview();
                }
            };
            const presetHandler2 = (e) => {
                const inp = e.target;
                if (inp.dataset.field === 'channelName') {
                    const autoFilled = inp.dataset.autoFilled === 'true';
                    if (!autoFilled || inp.value !== inp.dataset.lastAutoValue) { inp.dataset.manualEdited = 'true'; }
                    else { inp.dataset.manualEdited = ''; }
                    inp.dataset.lastAutoValue = inp.value;
                }
            };
            this.container._presetInputHandler1 = presetHandler1;
            this.container._presetInputHandler2 = presetHandler2;
            this.container.addEventListener('input', presetHandler1);
            this.container.addEventListener('input', presetHandler2);
        },

        _smartParse(text) {
            const allRows = [...this.container.querySelectorAll('.module-row')];
            const lines = text.split('\n');
            const allLabels = this._getAllParseLabels();
            let tipStart = -1, addStart = -1;
            for (let i = 0; i < lines.length; i++) {
                const trimmed = lines[i].trim();
                if (trimmed.includes('提示】')) tipStart = i + 1;
                if (trimmed.includes('补充】')) addStart = i + 1;
            }
            if (tipStart === -1 && addStart === -1) { this._showToast('⚠️ 未找到【提示】或【补充】标记'); return; }
            const validLines = [];
            for (let i = 0; i < lines.length; i++) { if (lines[i].trim()) validLines.push({ index: i, text: lines[i].trim() }); }
            const parseLines = (startIdx, endIdx, section) => {
                if (startIdx >= validLines.length) return;
                let startPos = 0;
                for (let i = 0; i < validLines.length; i++) { if (validLines[i].index >= startIdx) { startPos = i; break; } }
                let endPos = validLines.length;
                if (endIdx < lines.length) { for (let i = startPos; i < validLines.length; i++) { if (validLines[i].index >= endIdx) { endPos = i; break; } } }
                let contentBlocks = [], currentLabel = null, currentContent = [];
                for (let i = startPos; i < endPos; i++) {
                    const lineText = validLines[i].text;
                    let foundLabel = null;
                    for (const label of allLabels) { if (lineText.startsWith(label)) { foundLabel = label; break; } }
                    if (foundLabel) {
                        if (currentLabel) contentBlocks.push({ label: currentLabel, content: currentContent.join('\n').trim() });
                        currentLabel = foundLabel;
                        currentContent = [lineText.substring(foundLabel.length).trim()];
                    } else if (currentLabel) { currentContent.push(lineText); }
                }
                if (currentLabel) contentBlocks.push({ label: currentLabel, content: currentContent.join('\n').trim() });
                for (const block of contentBlocks) this._fillBlockToDOM(allRows, section, block.label, block.content);
            };
            if (tipStart !== -1) { const tipEnd = addStart !== -1 ? addStart - 1 : lines.length; parseLines(tipStart, tipEnd, 'tip'); }
            if (addStart !== -1) parseLines(addStart, lines.length, 'add');
            this.updatePreview();
        },

        _fillBlockToDOM(allRows, section, label, content) {
            if (!content) return;
            const originalLabel = Object.keys(this._fieldLabelMap).find(key => this._fieldLabelMap[key] === label) || label;
            const labelHandlers = {
                '频道': () => { const match = content.match(/^(\w+)\s*[（(](.+?)[）)]/); const inputs = this._getSectionInputs(allRows, section, '频道'); if (match && inputs.length >= 2) { inputs[0].value = match[1].trim(); inputs[1].value = match[2].trim(); } },
                '栏目': () => { const lastBracket = this._findLastBracketPair(content); const inputs = this._getSectionInputs(allRows, section, '栏目'); if (lastBracket && inputs.length >= 2) { inputs[0].value = lastBracket.main; inputs[1].value = lastBracket.bracket; } else if (inputs.length >= 1) inputs[0].value = content; },
                '标题': () => { const inputs = this._getSectionInputs(allRows, section, '标题'); if (inputs.length >= 1) inputs[0].value = content; },
                '内容': () => { const match = content.match(/^(\d{1,2}):(\d{2})\s*播出\s*([\s\S]*)/); const inputs = this._getSectionInputs(allRows, section, '内容'); if (match && inputs.length >= 2) { inputs[0].value = match[1].padStart(2,'0'); inputs[1].value = match[2].padStart(2,'0'); const contentWithBracket = match[3]; const lastBracket = this._findLastBracketPair(contentWithBracket); const textareas = this._getSectionTextareas(allRows, section, '内容'); if (lastBracket && textareas.length >= 1) { textareas[0].value = lastBracket.main; const allInputs = this._getAllInputsInSectionRow(allRows, section, '内容'); if (allInputs.length >= 3) allInputs[2].value = lastBracket.bracket; } else if (textareas.length >= 1) textareas[0].value = contentWithBracket; } },
                '播出时间': () => { const match = content.match(/(\d{8})\s*(\d{1,2}):(\d{2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2}):(\d{2})/); const inputs = this._getSectionInputs(allRows, section, '播出时间'); if (match && inputs.length >= 7) { inputs[0].value = match[1]; inputs[1].value = match[2].padStart(2,'0'); inputs[2].value = match[3].padStart(2,'0'); inputs[3].value = match[4].padStart(2,'0'); inputs[4].value = match[5].padStart(2,'0'); inputs[5].value = match[6].padStart(2,'0'); inputs[6].value = match[7].padStart(2,'0'); } },
                '新闻时长': () => { const match = content.match(/(\d+)'(\d+)"/); const inputs = this._getSectionInputs(allRows, section, '新闻时长'); if (match && inputs.length >= 2) { inputs[0].value = match[1].padStart(2,'0'); inputs[1].value = match[2].padStart(2,'0'); } },
                '露出时长': () => { const match = content.match(/(\d+)'(\d+)"/); const inputs = this._getSectionInputs(allRows, section, '露出时长'); if (match && inputs.length >= 2) { inputs[0].value = match[1].padStart(2,'0'); inputs[1].value = match[2].padStart(2,'0'); } },
                '记者': () => { const inputs = this._getSectionInputs(allRows, section, '记者'); if (inputs.length >= 1) inputs[0].value = content; },
                '摘要': () => { const lastBracket = this._findLastBracketPair(content); const textareas = this._getSectionTextareas(allRows, section, '摘要'); if (lastBracket && textareas.length >= 1) { textareas[0].value = lastBracket.main; const allInputs = this._getAllInputsInSectionRow(allRows, section, '摘要'); if (allInputs.length >= 1) allInputs[0].value = lastBracket.bracket; } else if (textareas.length >= 1) textareas[0].value = content; },
                '全文': () => { const lastBracket = this._findLastBracketPair(content); const textareas = this._getSectionTextareas(allRows, section, '全文'); if (lastBracket && textareas.length >= 1) { textareas[0].value = lastBracket.main; const allInputs = this._getAllInputsInSectionRow(allRows, section, '全文'); if (allInputs.length >= 1) allInputs[0].value = lastBracket.bracket; } else if (textareas.length >= 1) textareas[0].value = content; },
                '链接': () => { const textareas = this._getSectionTextareas(allRows, section, '链接'); if (textareas.length >= 1) textareas[0].value = content; },
                '微盘': () => { const inputs = this._getSectionInputs(allRows, section, '微盘'); if (inputs.length >= 1) inputs[0].value = content; }
            };
            for (const [prefix, handler] of Object.entries(labelHandlers)) { if (originalLabel.startsWith(prefix)) { handler(); break; } }
        },

        _findLastBracketPair(text) {
            if (!text) return null;
            const pairs = [{ open: '（', close: '）' }, { open: '(', close: ')' }];
            let lastClosePos = -1, matchPair = null;
            for (const pair of pairs) { const pos = text.lastIndexOf(pair.close); if (pos > lastClosePos) { lastClosePos = pos; matchPair = pair; } }
            if (lastClosePos === -1 || !matchPair) return null;
            let depth = 1, openPos = -1;
            for (let i = lastClosePos - 1; i >= 0; i--) { if (text[i] === matchPair.close) depth++; else if (text[i] === matchPair.open) { depth--; if (depth === 0) { openPos = i; break; } } }
            if (openPos === -1) return null;
            const bracket = text.substring(openPos + 1, lastClosePos).trim();
            const main = (text.substring(0, openPos) + text.substring(lastClosePos + 1)).trim();
            return { main, bracket };
        },

        _getSectionInputs(allRows, section, label) {
            for (const row of allRows) { if (row.dataset.section === section) { const fix = row.querySelector('.fix-text'); if (fix && fix.innerText.startsWith(label)) { const inputs = []; row.querySelectorAll('.input-single').forEach(inp => inputs.push(inp)); return inputs; } } }
            return [];
        },
        _getSectionTextareas(allRows, section, label) {
            for (const row of allRows) { if (row.dataset.section === section) { const fix = row.querySelector('.fix-text'); if (fix && fix.innerText.startsWith(label)) { const textareas = []; row.querySelectorAll('textarea').forEach(ta => textareas.push(ta)); return textareas; } } }
            return [];
        },
        _getAllInputsInSectionRow(allRows, section, label) {
            for (const row of allRows) { if (row.dataset.section === section) { const fix = row.querySelector('.fix-text'); if (fix && fix.innerText.startsWith(label)) { const inputs = []; row.querySelectorAll('input').forEach(inp => inputs.push(inp)); return inputs; } } }
            return [];
        },

        _insertFormatBar() {
            const oldBar = document.getElementById('formatBar');
            if (oldBar) oldBar.remove();
            const previewAll = document.getElementById('previewAll');
            if (!previewAll) return;
            const formatBar = document.createElement('div');
            formatBar.id = 'formatBar';
            formatBar.style.cssText = 'margin:20px 0 10px 0;padding:8px 15px;background:#f9fafb;border:1px solid #e0e0e0;border-radius:8px;';
            formatBar.innerHTML = `
                <div id="formatBarHeader" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;">
                    <span style="font-weight:bold;font-size:13px;">📋 快捷格式化 <span style="font-size:11px;color:#999;">（点击展开/折叠）</span></span>
                    <span id="formatToggleIcon" style="font-size:16px;">▶</span>
                </div>
                <div id="formatBarBody" style="display:none;margin-top:10px;">
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                        <input type="text" id="formatDate" class="input-single" style="width:100px;" value="${this.App.api.getCurrentDateStr()}" placeholder="日期">
                        <input type="text" id="formatChannel" class="input-single" style="width:80px;" placeholder="频道"><span class="fix-text">(</span>
                        <input type="text" id="formatChannelName" class="input-single" style="width:100px;" placeholder="频道名"><span class="fix-text">)&nbsp;</span>
                        <input type="text" id="formatColumn" class="input-single" style="width:120px;" placeholder="栏目">
                        <input type="text" id="formatTitle" class="input-single" style="width:180px;" placeholder="标题">
                        <button class="btn btn-light" id="copyFormatBtn" style="font-size:12px;">📋 复制</button>
                    </div>
                </div>
            `;
            previewAll.parentNode.insertBefore(formatBar, previewAll);
            const header = document.getElementById('formatBarHeader');
            const body = document.getElementById('formatBarBody');
            const icon = document.getElementById('formatToggleIcon');
            header.addEventListener('click', () => { if (body.style.display === 'none') { body.style.display = 'block'; icon.textContent = '▼'; } else { body.style.display = 'none'; icon.textContent = '▶'; } });
            this._bindFormatBar();
            this._syncFormatBar();
        },

        _bindFormatBar() {
            ['formatDate','formatChannel','formatChannelName','formatColumn','formatTitle'].forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener('input', () => { el.dataset.modified = 'true'; }); });
            document.getElementById('copyFormatBtn')?.addEventListener('click', () => {
                const date = document.getElementById('formatDate').value;
                const channel = document.getElementById('formatChannel').value;
                const channelName = document.getElementById('formatChannelName').value;
                const column = document.getElementById('formatColumn').value;
                const title = document.getElementById('formatTitle').value;
                const parts = [];
                if (date) parts.push(date);
                if (channel || channelName) parts.push(`${channel}${channelName ? '(' + channelName + ')' : ''}`);
                if (column) parts.push(column);
                if (title) parts.push(title);
                this._copyText(this._applyPunctuation(parts.join(' ')));
            });
        },

        _syncFormatBar() {
            const fd = document.getElementById('formatDate'), fc = document.getElementById('formatChannel'), fcn = document.getElementById('formatChannelName'), fcol = document.getElementById('formatColumn'), ft = document.getElementById('formatTitle');
            if (!fd || !fc || !fcn || !fcol || !ft) return;
            if (!fd.dataset.modified) fd.value = this.App.api.getCurrentDateStr();
            const allRows = [...this.container.querySelectorAll('.module-row')];
            let tip = false, cn = '', cna = '', col = '', ct = '';
            for (const row of allRows) { const fix = row.querySelector('.fix-text'); if (!fix) continue; const txt = fix.innerText; if (txt.includes('提示】')) { tip = true; continue; } if (txt.includes('补充】')) break; if (!tip) continue; if (txt.startsWith('频道')) { const ins = row.querySelectorAll('.input-single'); if (ins.length>=2) { cn=ins[0].value; cna=ins[1].value; } } else if (txt.startsWith('栏目')) { const ins = row.querySelectorAll('.input-single'); if (ins.length>=1) { col=ins[0].value; } } else if (txt.startsWith('内容')) { const ta = row.querySelector('textarea'); if (ta) ct=ta.value; } }
            if (!fc.dataset.modified) fc.value = cn;
            if (!fcn.dataset.modified) fcn.value = cna;
            if (!fcol.dataset.modified) fcol.value = col;
            if (!ft.dataset.modified) ft.value = ct;
        },

        _createTitleFloatingBtn() {
            const oldBtn = document.getElementById('titleFloatBtn');
            if (oldBtn) oldBtn.remove();
            const floatBtn = document.createElement('button');
            floatBtn.id = 'titleFloatBtn';
            floatBtn.textContent = '👤 Title';
            floatBtn.style.cssText = 'display:none;position:fixed;bottom:20px;right:20px;z-index:999;padding:10px 16px;background:#1677ff;color:#fff;border:none;border-radius:50px;cursor:pointer;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.2);';
            document.body.appendChild(floatBtn);
            floatBtn.addEventListener('click', () => this._toggleTitlePopup());
        },

        _bindTitleFocusEvents(con) {
            if (!con) return;
            const floatBtn = document.getElementById('titleFloatBtn');
            if (!floatBtn) return;
            if (con._titleFocusInHandler) con.removeEventListener('focusin', con._titleFocusInHandler);
            if (con._titleFocusOutHandler) con.removeEventListener('focusout', con._titleFocusOutHandler);
            const inHandler = (e) => { const ta = e.target; if (ta && ta.classList.contains('textarea-mod')) { const row = ta.closest('.module-row'); if (row) { const fix = row.querySelector('.fix-text'); if (fix && (fix.innerText.startsWith('摘要') || fix.innerText.startsWith('全文'))) { floatBtn.style.display = 'block'; } } } };
            const outHandler = () => { setTimeout(() => { const activeEl = document.activeElement; if (!activeEl || !activeEl.classList.contains('textarea-mod')) { floatBtn.style.display = 'none'; } }, 100); };
            con._titleFocusInHandler = inHandler;
            con._titleFocusOutHandler = outHandler;
            con.addEventListener('focusin', inHandler);
            con.addEventListener('focusout', outHandler);
        },

        _toggleTitlePopup() { const existing = document.getElementById('titlePopup'); if (existing) { existing.remove(); return; } this._showTitlePopup(); },

        _showTitlePopup() {
            const presets = this._loadTitlePresets();
            const popup = document.createElement('div');
            popup.id = 'titlePopup';
            popup.style.cssText = 'position:fixed;bottom:70px;right:20px;z-index:1000;background:#fff;border:1px solid #ddd;border-radius:8px;padding:15px;box-shadow:0 4px 16px rgba(0,0,0,0.15);width:300px;max-height:400px;overflow-y:auto;';
            popup.innerHTML = `<div id="titlePopupHeader" style="cursor:move;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #eee;padding-bottom:5px;margin-bottom:10px;"><span style="font-weight:bold;">👤 Title 预设</span><button id="popupCloseBtn" style="background:none;border:none;font-size:18px;cursor:pointer;">✕</button></div><div id="presetList" style="max-height:250px;overflow-y:auto;"></div><div style="margin-top:10px;display:flex;gap:8px;"><button id="addPresetBtn" class="btn btn-primary btn-sm" style="flex:1;">➕ 添加</button></div>`;
            document.body.appendChild(popup);
            const listContainer = popup.querySelector('#presetList');
            const renderPresets = () => { const currentPresets = this._loadTitlePresets(); let html = ''; currentPresets.forEach((p, i) => { const key = `${hotkeyModifier}+${i+1}`; html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee;"><span class="title-name-click" data-idx="${i}" style="cursor:pointer;font-weight:bold;flex:1;">${p.name}</span><span style="font-size:11px;color:#999;margin-right:8px;">${key}</span><button class="edit-preset-btn" data-idx="${i}" style="border:none;background:none;cursor:pointer;font-size:12px;">✎</button><button class="del-preset-btn" data-idx="${i}" style="border:none;background:none;cursor:pointer;font-size:12px;color:#f53f3f;">×</button></div>`; }); listContainer.innerHTML = html; listContainer.querySelectorAll('.title-name-click').forEach(el => { el.addEventListener('click', () => { const idx = parseInt(el.dataset.idx); const p = currentPresets[idx]; if (!p) return; this._insertTitle(p.name, p.titleStr); popup.remove(); }); }); listContainer.querySelectorAll('.edit-preset-btn').forEach(el => { el.addEventListener('click', (e) => { e.stopPropagation(); const idx = parseInt(el.dataset.idx); const newVal = prompt('编辑（名称 文本）：', `${currentPresets[idx].name} ${currentPresets[idx].titleStr||''}`); if (newVal) { const parts = newVal.trim().split(/\s+/); currentPresets[idx].name = parts[0]; currentPresets[idx].titleStr = parts.slice(1).join(' '); this._saveTitlePresets(currentPresets); renderPresets(); } }); }); listContainer.querySelectorAll('.del-preset-btn').forEach(el => { el.addEventListener('click', (e) => { e.stopPropagation(); const idx = parseInt(el.dataset.idx); if (confirm(`确定删除 "${currentPresets[idx].name}"？`)) { currentPresets.splice(idx, 1); this._saveTitlePresets(currentPresets); renderPresets(); } }); }); };
            renderPresets();
            popup.querySelector('#popupCloseBtn').addEventListener('click', () => popup.remove());
            popup.querySelector('#addPresetBtn').addEventListener('click', () => { const input = prompt('添加预设（名称 文本）：', '新人物 头衔'); if (input) { const parts = input.trim().split(/\s+/); const currentPresets = this._loadTitlePresets(); currentPresets.push({ name: parts[0], titleStr: parts.slice(1).join(' ') }); this._saveTitlePresets(currentPresets); renderPresets(); } });
            this._makeDraggable(popup, popup.querySelector('#titlePopupHeader'));
        },

        _makeDraggable(element, handle) {
            let isDragging = false, startX, startY, initialLeft, initialTop;
            handle.addEventListener('mousedown', (e) => { isDragging = true; startX = e.clientX; startY = e.clientY; const rect = element.getBoundingClientRect(); initialLeft = rect.left; initialTop = rect.top; document.addEventListener('mousemove', onMouseMove); document.addEventListener('mouseup', onMouseUp); e.preventDefault(); });
            const onMouseMove = (e) => { if (!isDragging) return; element.style.left = (initialLeft + e.clientX - startX) + 'px'; element.style.top = (initialTop + e.clientY - startY) + 'px'; element.style.right = 'auto'; element.style.bottom = 'auto'; };
            const onMouseUp = () => { isDragging = false; document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); };
        },

        _insertTitle(name, titleStr) {
            const activeEl = document.activeElement;
            if (!activeEl || !activeEl.classList.contains('textarea-mod')) { this._showToast('⚠️ 请先点击摘要或全文的文本框'); return; }
            const formatted = titleStr ? `${name} ${titleStr}：` : `${name}：`;
            const ta = activeEl, start = ta.selectionStart, end = ta.selectionEnd, text = ta.value;
            ta.value = text.substring(0, start) + formatted + text.substring(end);
            ta.selectionStart = ta.selectionEnd = start + formatted.length;
            ta.focus();
        },

        _loadTitlePresets() { return this.App.api.storageGet('title_presets') || [{ name: '主持人', titleStr: '' },{ name: '旁白', titleStr: '' },{ name: '画外音', titleStr: '' },{ name: '记者', titleStr: '' }]; },
        _saveTitlePresets(presets) { this.App.api.storageSet('title_presets', presets); },

        _bindTimeJump(container) {
            container.querySelectorAll('.module-row').forEach(row => {
                const inputs = Array.from(row.querySelectorAll('.time-h, .time-m, .time-s'));
                inputs.forEach((inp, idx) => {
                    const handler = () => { let v = inp.value.replace(/\D/g, '').slice(0, 2); const n = parseInt(v, 10); if (inp.classList.contains('time-h') && n > 23) v = '23'; else if (!inp.classList.contains('time-h') && n > 59) v = '59'; inp.value = v; if (v.length === 2 && idx < inputs.length - 1) { inputs[idx + 1].focus(); inputs[idx + 1].select(); } };
                    const blurHandler = () => { inp.value = (inp.value.replace(/\D/g, '') || '0').padStart(2, '0').slice(0, 2); };
                    const keydownHandler = (e) => { if (e.key === ' ' || e.key === ':' || e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); let v = inp.value.replace(/\D/g, ''); if (!v) v = '0'; if (v.length === 1) v = '0' + v; const num = parseInt(v, 10); if (inp.classList.contains('time-h') && num > 23) v = '23'; else if (!inp.classList.contains('time-h') && num > 59) v = '59'; inp.value = v.padStart(2, '0'); if (idx < inputs.length - 1) { inputs[idx + 1].focus(); inputs[idx + 1].select(); } } };
                    const focusHandler = () => inp.select();
                    inp.addEventListener('input', handler); inp.addEventListener('blur', blurHandler); inp.addEventListener('keydown', keydownHandler); inp.addEventListener('focus', focusHandler);
                });
            });
        },

        _bindTipToAddSync(container) {
            if (container._tipToAddHandler) container.removeEventListener('input', container._tipToAddHandler);
            const handler = (e) => { const el = e.target; if (el.dataset.section === 'tip' && el.dataset.field) { if (this.syncTimer) clearTimeout(this.syncTimer); this.syncTimer = setTimeout(() => { this._syncTipToAdd(); this._syncFormatBar(); this.syncTimer = null; }, 100); } };
            container._tipToAddHandler = handler;
            container.addEventListener('input', handler);
        },

        _syncTipToAdd() {
            const mapping = { channelNum: 'channelNum', channelName: 'channelName', column: 'column', content: 'title', columnBracket: 'columnBracket' };
            for (let [tipField, addField] of Object.entries(mapping)) { const tipEl = this.container.querySelector(`[data-section="tip"][data-field="${tipField}"]`); const addEl = this.container.querySelector(`[data-section="add"][data-field="${addField}"]`); if (tipEl && addEl) addEl.value = tipEl.value; }
            this.updatePreview();
        },

        _bindRealTimePreview(container) {
            if (container._rtPreviewHandler) container.removeEventListener('input', container._rtPreviewHandler);
            let timer = null;
            const handler = (e) => { if (e.target.matches('.input-single, .time-h, .time-m, .time-s, .textarea-mod, .broadcast-date, .fix-edit')) { clearTimeout(timer); timer = setTimeout(() => { this.updatePreview(); this._syncFormatBar(); }, 100); } };
            container._rtPreviewHandler = handler;
            container.addEventListener('input', handler);
        },

        _bindContainerEvents(con) {
            if (con._copyBtnHandler) con.removeEventListener('click', con._copyBtnHandler);
            const handler = (e) => { const t = e.target.closest('.title-copy-btn'); if (t) { this._showCopyConfirm(t.dataset.type); } };
            con._copyBtnHandler = handler;
            con.addEventListener('click', handler);
        },

        _bindGlobalEvents() {
            if (this._globalEventsBound) return;
            this._globalEventsBound = true;
            const actions = [
                ['toggleEditMode', () => { this.App.state.editMode = !this.App.state.editMode; const btn = document.getElementById('editBtn'); if (btn) { btn.innerText = this.App.state.editMode ? '✅ 退出编辑模式' : '🔧 开启编辑模式'; btn.classList.toggle('btn-success', this.App.state.editMode); btn.classList.toggle('btn-warning', !this.App.state.editMode); } this.render(); this.updatePreview(); }],
                ['saveDefault', () => { if (!confirm('确定将当前排版设为默认模板？')) return; this.syncUIData(); this.App.api.storageSet('main_richang', this.nowTemp); this.App.api.storageSet('main_quantao', this.nowTemp); this._showToast('✅ 已永久保存'); }],
                ['resetConfig', () => { if (!confirm('确定恢复原始模板？（不会清除用户映射）')) return; this.App.api.storageRemove('main_richang'); this.App.api.storageRemove('main_quantao'); this.App.api.storageRemove('yuqing_presets'); this.presets = { channels: this._defaultPresets.channels.map(c => ({ ...c })), columns: this._defaultPresets.columns.slice() }; this._savePresets(); this._loadTemplate(); this.render(); this.updatePreview(); this._showToast('✅ 已恢复模板，字段映射保留'); }],
                ['clearAll', () => { if (!confirm('确定清空所有文本框？')) return; this.container.querySelectorAll('.input-single, .time-h, .time-m, .time-s, .fix-edit').forEach(el => el.value = ''); this.container.querySelectorAll('.textarea-mod').forEach(el => el.value = ''); this.updatePreview(); }],
                ['copyTip', () => { this._showCopyConfirm('tip'); }],
                ['copyAdd', () => { this._showCopyConfirm('add'); }],
                ['resetAll', () => { if (!confirm('确定恢复全部默认设置？')) return; this._fieldLabelMap = {}; this._punctuationMode = 'off'; this._saveSettings(); this.App.api.storageRemove('main_richang'); this.App.api.storageRemove('main_quantao');this.App.api.storageRemove('yuqing_presets');this._loadPresets();this._loadTemplate(); this.render(); this.updatePreview(); this._showToast('✅ 已完全恢复默认'); }]
            ];
            actions.forEach(([name, fn]) => this._eventUnsubscribers.push(this.App.EventBus.on(name, fn)));
        },

        _showCopyConfirm(section) {
            if (!this._reviewEnabled) {
                this.updatePreview();
                const startIdx = this.lineList.findIndex(x => { if (section === 'tip') return x.includes('提示】'); else return x.includes('补充】'); });
                let endIdx;
                if (section === 'tip') { endIdx = this.lineList.findIndex((x, i) => i > startIdx && x.includes('补充】')); if (endIdx === -1) endIdx = this.lineList.length; }
                else { endIdx = this.lineList.length; }
                const fullText = this.lineList.slice(startIdx, endIdx).join('\n');
                this._copyText(this._applyPunctuation(fullText));
                return;
            }

            this.updatePreview();
            const keyword = this.App.state.currS === 'yuqing' ? '舆情' : '正面';
            const sectionLabel = section === 'tip' ? '提示' : '补充';
            const typeColor = keyword === '舆情' ? '#f53f3f' : '#009e5f';
            const confirmButtonText = `确认，开始审阅${keyword}`;

            const startIdx = this.lineList.findIndex(x => { if (section === 'tip') return x.includes('提示】'); else return x.includes('补充】'); });
            let endIdx;
            if (section === 'tip') { endIdx = this.lineList.findIndex((x, i) => i > startIdx && x.includes('补充】')); if (endIdx === -1) endIdx = this.lineList.length; }
            else { endIdx = this.lineList.length; }
            const fullText = this.lineList.slice(startIdx, endIdx).join('\n');

            const rows = this.container.querySelectorAll(`.module-row[data-section="${section}"]`);
            const fields = [];
            const focusLabels = ['频道', '栏目', '标题', '内容', '摘要', '全文', '播出时间', '新闻时长', '露出时长'];

            rows.forEach(row => {
                const fixFirst = row.querySelector('.fix-text');
                if (fixFirst && fixFirst.innerText && (fixFirst.innerText.includes('提示】') || fixFirst.innerText.includes('补充】'))) return;
                let labelText = '', valueText = '';
                row.querySelectorAll('.mod-item').forEach(item => { const f = item.querySelector('.fix-text'), inp = item.querySelector('input'), ta = item.querySelector('textarea'); if (f) labelText += f.innerText; if (inp) valueText += inp.value; if (ta) valueText += ta.value; });
                if (labelText && valueText !== undefined) { let cleanLabel = labelText.replace(/[：:]/g,'').trim(); if (fields.some(f => f.label === cleanLabel)) return; const isEmpty = !valueText.trim(); const isFocus = focusLabels.some(fl => cleanLabel.startsWith(fl)); let specialCheck = ''; if (cleanLabel.startsWith('播出时间')) { const dateMatch = valueText.match(/^(\d{8})/); if (dateMatch) { specialCheck = dateMatch[1] === this.App.api.getCurrentDateStr() ? '✅ 日期为今天' : '⚠️ 日期不是今天'; } } fields.push({ label: cleanLabel, value: valueText.trim(), isEmpty, isFocus, specialCheck }); }
            });

            const newsTime = fields.find(f => f.label === '新闻时长'), exposeTime = fields.find(f => f.label === '露出时长');
            if (newsTime && exposeTime) { const nv = newsTime.value.replace(/['\"]/g,''), ev = exposeTime.value.replace(/['\"]/g,''); if (nv && ev) { const equal = nv === ev; newsTime.specialCheck = equal ? '✅ 与露出时长相等' : '⚠️ 与露出时长不相等'; exposeTime.specialCheck = equal ? '✅ 与新闻时长相等' : '⚠️ 与新闻时长不相等'; } }

            if (fields.length === 0) { this._showToast('⚠️ 没有可审阅的字段'); return; }

            let step = 'confirm', currentIndex = 0;
            document.querySelectorAll('[data-yq-copy-overlay]').forEach(o => o.remove());
            const overlay = document.createElement('div');
            overlay.setAttribute('data-yq-copy-overlay', '1');
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
            const modalContent = document.createElement('div');
            modalContent.style.cssText = 'background:#fff;color-scheme:light only;border-radius:12px;padding:24px;max-width:900px;width:95%;max-height:85vh;overflow-y:auto;box-shadow:0 8px 30px rgba(0,0,0,0.25);';
            overlay.appendChild(modalContent);
            document.body.appendChild(overlay);
            overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

            const renderConfirm = () => {
                modalContent.innerHTML = `<div style="text-align:center;margin-bottom:20px;"><span style="font-size:18px;font-weight:bold;color:${typeColor};">【央视${keyword}${sectionLabel}】</span></div><div style="margin-bottom:20px;padding:12px;background:#f8f8f8;border-radius:6px;white-space:pre-wrap;font-size:13px;line-height:1.6;max-height:300px;overflow-y:auto;">${fullText}</div><div style="text-align:center;color:#666;margin-bottom:20px;">请确认类型是否正确？</div><div style="display:flex;gap:10px;justify-content:center;"><button class="btn btn-light" id="cancelConfirmBtn">取消</button><button class="btn" id="startReviewBtn" style="background:${typeColor};color:#fff;padding:6px 14px;border:none;border-radius:4px;cursor:pointer;font-size:13px;">${confirmButtonText}</button></div>`;
                modalContent.querySelector('#cancelConfirmBtn').addEventListener('click', () => overlay.remove());
                modalContent.querySelector('#startReviewBtn').addEventListener('click', () => { step = 'review'; renderReview(); });
            };

            const renderReview = () => {
                modalContent.innerHTML = `<div style="text-align:center;margin-bottom:16px;"><span style="font-size:18px;font-weight:bold;color:${typeColor};">【央视${keyword}${sectionLabel}】 - 审阅</span></div><div style="display:flex;gap:20px;"><div style="flex:1;min-width:200px;padding:10px;background:#f8f8f8;border-radius:6px;white-space:pre-wrap;font-size:13px;line-height:1.6;max-height:50vh;overflow-y:auto;">${fullText}</div><div style="flex:1;min-width:250px;"><div id="fieldDetail" style="min-height:100px;"></div><div style="display:flex;justify-content:space-between;margin-top:20px;"><div><button class="btn btn-light" id="prevFieldBtn" disabled>◀ 上一项</button><button class="btn btn-light" id="nextFieldBtn">下一项 ▶</button></div><div><button class="btn btn-light" id="cancelCopyBtn">✗ 返回修改</button><button class="btn" id="confirmCopyBtn" style="background:${typeColor};color:#fff;padding:6px 14px;border:none;border-radius:4px;cursor:pointer;font-size:13px;">✓ 确认复制</button></div></div></div></div>`;
                const fieldDiv = modalContent.querySelector('#fieldDetail'), prevBtn = modalContent.querySelector('#prevFieldBtn'), nextBtn = modalContent.querySelector('#nextFieldBtn'), cancelBtn = modalContent.querySelector('#cancelCopyBtn'), confirmBtn = modalContent.querySelector('#confirmCopyBtn');
                const renderField = (index) => { const f = fields[index]; const isEmptyClass = f.isEmpty ? 'background:#fff2f0;' : ''; const focusMark = f.isFocus ? ' 🔍' : ''; const specialMsg = f.specialCheck ? `<div style="font-size:12px;margin-top:4px;color:${f.specialCheck.startsWith('✅')?'#009e5f':'#f53f3f'};">${f.specialCheck}</div>` : ''; let valueDisplay; if (f.isEmpty) { valueDisplay = '<span style="color:#f53f3f;">⚠️ 未填写</span>'; } else if (f.label.startsWith('播出时间')) { const match = f.value.match(/^(\d{4})(\d{2})(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2}):(\d{2})/); if (match) { valueDisplay = `<div style="font-size:13px;line-height:1.8;"><div>📅 日期：${match[1]}-${match[2]}-${match[3]}</div><div>⏰ 开始：${match[4]}:${match[5]}:${match[6]}</div><div>⏰ 结束：${match[7]}:${match[8]}:${match[9]}</div></div>`; } else { valueDisplay = `<span style="color:#333;">${f.value}</span>`; } } else { valueDisplay = `<span style="color:#333;">${f.value}</span>`; } return `<div style="margin-bottom:12px;padding:10px;border:1px solid #eee;border-radius:8px;${isEmptyClass}"><div style="font-size:12px;color:#999;margin-bottom:4px;">字段 ${index+1}/${fields.length}</div><div style="font-weight:bold;font-size:15px;margin-bottom:6px;">${f.label}${focusMark}</div><div>${valueDisplay}</div>${specialMsg}</div>`; };
                const updateField = () => { fieldDiv.innerHTML = renderField(currentIndex); prevBtn.disabled = currentIndex === 0; nextBtn.disabled = currentIndex === fields.length - 1; }; updateField();
                prevBtn.addEventListener('click', () => { if (currentIndex > 0) { currentIndex--; updateField(); } });
                nextBtn.addEventListener('click', () => { if (currentIndex < fields.length - 1) { currentIndex++; updateField(); } });
                cancelBtn.addEventListener('click', () => overlay.remove());
                confirmBtn.addEventListener('click', () => { overlay.remove(); this._copyText(this._applyPunctuation(fullText)); });
            };

            renderConfirm();
        },

        syncUIData() {
            this.container.querySelectorAll('.module-row').forEach((rd, ri) => { if (ri >= this.nowTemp.length) return; rd.querySelectorAll('.mod-item').forEach((id, ii) => { if (ii >= this.nowTemp[ri].length) return; const m = this.nowTemp[ri][ii]; const f = id.querySelector('.fix-text'); const i = id.querySelector('input'); const t = id.querySelector('textarea'); if (f && m.type==='fix') m.text = f.innerText; else if (i) m.text = i.value; else if (t) m.text = t.value; }); });
        },

        updatePreview() {
            this.syncUIData();
            this.lineList = [];
            this.container.querySelectorAll('.module-row').forEach(rd => { let l = ''; rd.querySelectorAll('.mod-item').forEach(id => { const f = id.querySelector('.fix-text'); const i = id.querySelector('input'); const t = id.querySelector('textarea'); if (f) l += f.innerText; else if (i) l += i.value; else if (t) l += t.value; }); this.lineList.push(l); });
            const pe = document.getElementById('previewAll');
            if (pe) pe.innerHTML = this.App.api.applyHighlight(this.lineList.join('\n'));
            this.save();
        }
    };

    window.__modules = window.__modules || {};
    window.__modules['richang'] = module;
    window.__modules['quantao'] = module;
})(window);