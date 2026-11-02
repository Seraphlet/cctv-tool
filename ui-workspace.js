/**
 * ui-workspace.js — 视觉与布局协调层（不修改原有模块、事件总线、存储契约）
 * 所有业务操作仍交由 core.js 和 modules/*.js 处理。
 */
(function (window, document) {
    'use strict';

    const UI_STORAGE_KEY = 'cmswrap_ui_layout_v2';
    const LINKS_STORAGE_KEY = 'cmswrap_quick_links_v1';
    const DEFAULT_LINKS = [
        { id: 'competitor', name: '友商竞品', url: 'https://doc.weixin.qq.com/sheet/e3_ALwAYwYsAAsCNVFexlQsRQfuIktLC?scode=AJEAIQdfAAoCn3bSKN&tab=BB08J2' },
        { id: 'draft', name: '主动落稿', url: 'https://docs.qq.com/sheet/DRGhoUktVT0V5alRY?tab=jbarjb&nlc=1' },
        { id: 'cctv', name: 'CCTV', url: 'https://tv.cctv.com/' }
    ];
    const $ = (selector) => document.querySelector(selector);

    function initWorkspaceUI() {
        if (document.documentElement.dataset.uiWorkspaceReady === '1') return;
        if (!window.App || !$('#mainTabs') || !$('#uiWorkspace')) return;
        document.documentElement.dataset.uiWorkspaceReady = '1';

        const body = document.body;
        const leftDrawer = $('#uiLeftDrawer');
        const leftBackdrop = $('#uiLeftBackdrop');
        const navTrigger = $('#uiNavTrigger');
        const navClose = $('#uiNavClose');
        const settingsPanel = $('#uiSettingsPanel');
        const settingsTrigger = $('#uiSettingsTrigger');
        const railSettings = $('#uiRailSettings');
        const linksToggle = $('#uiLinksToggle');
        const linksPanel = $('#uiLinksPanel');
        const settingsClose = $('#uiSettingsClose');
        const timeButton = $('#uiTimeToolsBtn');
        const modeButtons = Array.from(document.querySelectorAll('[data-ui-mode]'));
        const showNoteCheckbox = $('#uiShowScratchpad');
        const showImageCheckbox = $('#uiShowImagepad');
        const showWelcomeCheckbox = $('#uiShowCategoryWelcome');
        const showCopyCheckbox = $('#uiShowCopyFeedback');
        const utilityTitle = $('#uiUtilityTitle');
        const currentSection = $('#uiCurrentSection');
        const originalTabs = $('#mainTabs');
        const rightDock = $('.ui-right-dock');

        let preferences = { showScratchpad: true, showImagepad: true,
            showCategoryWelcome: true, showCopyFeedback: true };
        try {
            const saved = JSON.parse(localStorage.getItem(UI_STORAGE_KEY) || '{}');
            if (typeof saved.showScratchpad === 'boolean') preferences.showScratchpad = saved.showScratchpad;
            if (typeof saved.showImagepad === 'boolean') preferences.showImagepad = saved.showImagepad;
            if (typeof saved.showCategoryWelcome === 'boolean') preferences.showCategoryWelcome = saved.showCategoryWelcome;
            if (typeof saved.showCopyFeedback === 'boolean') preferences.showCopyFeedback = saved.showCopyFeedback;
        } catch (error) {
            console.debug('[UI] 无法读取显示偏好', error);
        }

        let settingsOpen = false;
        let linksOpen = false;
        let utilityOpen = false;
        let leftOpen = false;
        let observedNote = null;
        let observedImage = null;

        const notePanel = () => document.getElementById('scratchpadPanel');
        const imagePanel = () => document.getElementById('imagepadPanel');
        const noteToggle = () => document.getElementById('scratchpadToggle');
        const imageToggle = () => document.getElementById('imagepadToggle');

        function persistPreferences() {
            try { localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(preferences)); }
            catch (error) { console.debug('[UI] 显示偏好保存失败', error); }
        }

        function closeLeft() {
            leftOpen = false;
            leftDrawer.classList.remove('is-open');
            leftBackdrop.classList.remove('is-open');
            navTrigger.setAttribute('aria-expanded', 'false');
            leftDrawer.setAttribute('aria-hidden', 'true');
        }

        function openLeft() {
            leftOpen = true;
            leftDrawer.classList.add('is-open');
            leftBackdrop.classList.add('is-open');
            navTrigger.setAttribute('aria-expanded', 'true');
            leftDrawer.setAttribute('aria-hidden', 'false');
        }

        function closeOtherFloatingPanel(except) {
            const note = notePanel();
            const image = imagePanel();
            if (except !== 'note' && note) {
                note.classList.remove('show', 'fullscreen');
                const btn = noteToggle();
                if (btn) btn.setAttribute('aria-expanded', 'false');
            }
            if (except !== 'image' && image) {
                image.classList.remove('show', 'fullscreen');
                const btn = imageToggle();
                if (btn) btn.setAttribute('aria-expanded', 'false');
            }
        }

        function applyDockState() {
            const noteIsOpen = !!notePanel()?.classList.contains('show');
            const imageIsOpen = !!imagePanel()?.classList.contains('show');
            const active = settingsOpen ? 'settings' : linksOpen ? 'links' : noteIsOpen ? 'note' : imageIsOpen ? 'image' : '';
            body.dataset.uiDock = active;
            body.classList.toggle('ui-dock-open', Boolean(active));
            settingsPanel.hidden = !settingsOpen;
            linksPanel.hidden = !linksOpen;
            linksToggle.setAttribute('aria-expanded', String(linksOpen));
            linksToggle.classList.toggle('is-selected', active === 'links');
            settingsTrigger.setAttribute('aria-expanded', String(settingsOpen));
            railSettings.setAttribute('aria-expanded', String(settingsOpen));
            noteToggle()?.classList.toggle('is-selected', active === 'note');
            imageToggle()?.classList.toggle('is-selected', active === 'image');
            railSettings.classList.toggle('is-selected', active === 'settings');
        }

        function openSettings(next) {
            settingsOpen = next;
            if (next) linksOpen = false;
            if (settingsOpen) {
                closeOtherFloatingPanel(null);
                closeLeft();
            }
            applyDockState();
        }

        function toggleNoteOrImage(type) {
            settingsOpen = false;
            linksOpen = false;
            if (type === 'note' && notePanel()?.classList.contains('show')) {
                closeOtherFloatingPanel('note');
            } else if (type === 'image' && imagePanel()?.classList.contains('show')) {
                closeOtherFloatingPanel('image');
            }
            applyDockState();
        }

        function openLinks(next) {
            linksOpen = Boolean(next);
            if (linksOpen) {
                settingsOpen = false;
                closeOtherFloatingPanel(null);
                closeLeft();
            }
            applyDockState();
        }

        function syncToolVisibility() {
            showNoteCheckbox.checked = preferences.showScratchpad;
            showImageCheckbox.checked = preferences.showImagepad;

            const note = noteToggle();
            const image = imageToggle();
            if (note) note.hidden = !preferences.showScratchpad;
            if (image) image.hidden = !preferences.showImagepad;
            if (!preferences.showScratchpad && notePanel()?.classList.contains('show')) closeOtherFloatingPanel(null);
            if (!preferences.showImagepad && imagePanel()?.classList.contains('show')) closeOtherFloatingPanel(null);
            applyDockState();
        }

        const panelObserver = new MutationObserver(() => {
            // 全屏由 core.js 原始 class 机制处理；只同步侧栏占位。
            applyDockState();
        });

        function bindFloatingControls() {
            const note = noteToggle();
            const image = imageToggle();
            // 原悬浮按钮由 core.js 动态插入 body；只迁移按钮 DOM，不重建原事件。
            if (note && note.parentElement !== rightDock) rightDock.insertBefore(note, linksToggle);
            if (image && image.parentElement !== rightDock) rightDock.insertBefore(image, linksToggle);

            if (note && note.dataset.uiBound !== '1') {
                note.dataset.uiBound = '1';
                note.addEventListener('click', () => toggleNoteOrImage('note'));
            }
            if (image && image.dataset.uiBound !== '1') {
                image.dataset.uiBound = '1';
                image.addEventListener('click', () => toggleNoteOrImage('image'));
            }
            if (notePanel() && notePanel() !== observedNote) {
                observedNote = notePanel();
                panelObserver.observe(observedNote, { attributes: true, attributeFilter: ['class'] });
            }
            if (imagePanel() && imagePanel() !== observedImage) {
                observedImage = imagePanel();
                panelObserver.observe(observedImage, { attributes: true, attributeFilter: ['class'] });
            }
            syncToolVisibility();
        }

        // 图片暂存板打开 IndexedDB 后才创建元素，监听顶层元素新增。
        const floatingElementObserver = new MutationObserver((changes) => {
            if (changes.some((change) => change.addedNodes.length)) bindFloatingControls();
        });
        floatingElementObserver.observe(body, { childList: true });
        bindFloatingControls();

        navTrigger.addEventListener('click', () => leftOpen ? closeLeft() : openLeft());
        navClose.addEventListener('click', closeLeft);
        leftBackdrop.addEventListener('click', closeLeft);

        settingsTrigger.addEventListener('click', () => openSettings(!settingsOpen));
        railSettings.addEventListener('click', () => openSettings(!settingsOpen));
        settingsClose.addEventListener('click', () => openSettings(false));
        linksToggle.addEventListener('click', () => openLinks(!linksOpen));
        $('#uiLinksClose').addEventListener('click', () => openLinks(false));
        $('#uiHomeLogo').addEventListener('click', () => {
            switchToMode('richang');
            openSettings(false);
            openLinks(false);
        });

        showNoteCheckbox.addEventListener('change', () => {
            preferences.showScratchpad = showNoteCheckbox.checked;
            persistPreferences();
            syncToolVisibility();
        });
        showImageCheckbox.addEventListener('change', () => {
            preferences.showImagepad = showImageCheckbox.checked;
            persistPreferences();
            syncToolVisibility();
        });

        showWelcomeCheckbox.checked = preferences.showCategoryWelcome;
        showCopyCheckbox.checked = preferences.showCopyFeedback;
        showWelcomeCheckbox.addEventListener('change', () => {
            preferences.showCategoryWelcome = showWelcomeCheckbox.checked;
            persistPreferences();
            if (!preferences.showCategoryWelcome) $('#uiCategoryWelcome').hidden = true;
        });
        showCopyCheckbox.addEventListener('change', () => {
            preferences.showCopyFeedback = showCopyCheckbox.checked;
            persistPreferences();
            if (!preferences.showCopyFeedback) document.querySelectorAll('.yq-copy-feedback').forEach(el => el.remove());
        });

        function updateModeAndSection() {
            const current = window.App.state.currM;
            const isMain = current === 'richang' || current === 'quantao';
            body.classList.toggle('ui-other-module', !isMain && !utilityOpen);
            modeButtons.forEach((button) => {
                const selected = !utilityOpen && button.dataset.uiMode === current;
                button.classList.toggle('is-active', selected);
                button.setAttribute('aria-pressed', String(selected));
            });
            const activeTab = originalTabs.querySelector('span.active');
            if (utilityOpen) {
                currentSection.textContent = '时间工具';
                utilityTitle.textContent = '时间工具';
            } else if (isMain) {
                currentSection.textContent = current === 'richang' ? '日常监测' : '全套监测';
            } else {
                currentSection.textContent = activeTab ? activeTab.textContent.trim() : '工作区';
            }
            document.querySelectorAll('[data-ui-shortcut]').forEach(button => {
                const active = !utilityOpen && button.dataset.uiShortcut === current;
                button.classList.toggle('is-active', active);
                button.setAttribute('aria-pressed', String(active));
            });
            timeButton.classList.toggle('is-active', utilityOpen);
            body.classList.toggle('ui-utility-active', utilityOpen);
        }

        function switchToMode(mode) {
            utilityOpen = false;
            closeLeft();
            const original = originalTabs.querySelector('span[data-m="' + mode + '"]');
            if (original) original.click(); // 始终复用原有导航事件和 renderModule
            updateModeAndSection();
        }

        modeButtons.forEach((button) => button.addEventListener('click', () => switchToMode(button.dataset.uiMode)));
        timeButton.addEventListener('click', () => {
            utilityOpen = true;
            closeLeft();
            updateModeAndSection();
        });

        originalTabs.addEventListener('click', (event) => {
            if (!event.target.closest('span[data-m]')) return;
            utilityOpen = false;
            closeLeft();
            updateModeAndSection();
        });
        const subTabs = $('#yuqingTab');
        subTabs.addEventListener('click', (event) => {
            if (!event.target.closest('span')) return;
            closeLeft();
            const active = subTabs.querySelector('span.active');
            const suffix = active ? active.textContent.trim() : '舆情';
            $('#uiCurrentCategory').textContent = suffix;
        });

        // 自定义模板可被增删改，原 tabs DOM 每次都会由 core.js 整体重绘。
        new MutationObserver(updateModeAndSection).observe(originalTabs, { childList: true });

        // 按 ESC 关闭导航或设置；原悬浮工具的全屏/预览 ESC 仍由 core.js 处理。
        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;
            if (leftOpen) closeLeft();
            if (settingsOpen) openSettings(false);
            if (linksOpen) openLinks(false);
        });

        window.App.EventBus.on('tabChange', () => {
            utilityOpen = false;
            closeLeft();
            updateModeAndSection();
        });

        // 高频操作通过原有标签/按钮触发，避免复制业务逻辑。
        document.querySelectorAll('[data-ui-shortcut]').forEach(button => {
            button.addEventListener('click', () => switchToMode(button.dataset.uiShortcut));
        });
        $('#uiQuickClear').addEventListener('click', () => {
            const original = $('#clearAllBtn');
            if (original && original.style.display !== 'none') original.click();
        });

        // 类别按钮只使用 core.js 原始的子标签事件。
        function applyCategoryVisuals() {
            const selected = window.App.state.currS === 'zhengmian' ? 'zhengmian' : 'yuqing';
            body.dataset.uiCategory = selected;
            document.querySelectorAll('[data-ui-category]').forEach(button =>
                button.classList.toggle('is-active', button.dataset.uiCategory === selected)
            );
            const label = selected === 'zhengmian' ? '正面' : '舆情';
            $('#uiCurrentCategory').textContent = label;
            $('#uiQuickClear').title = '清空当前页面内容';
            $('#copyTipBtn').textContent = '📋 复制【' + label + '提示】整段';
            $('#copyAddBtn').textContent = '📋 复制【' + label + '补充】整段';
        }
        function chooseCategory(value) {
            const tab = subTabs.querySelector('span[data-s="' + value + '"]');
            if (tab) tab.click();
            applyCategoryVisuals();
        }
        document.querySelectorAll('[data-ui-category]').forEach(button =>
            button.addEventListener('click', () => chooseCategory(button.dataset.uiCategory))
        );
        subTabs.addEventListener('click', () => applyCategoryVisuals());
        window.App.EventBus.on('tabChange', applyCategoryVisuals);
        applyCategoryVisuals();

        // 每次新建页面实例只弹出一次；不写入 localStorage/sessionStorage。
        const welcome = $('#uiCategoryWelcome');
        const dismissWelcome = () => { welcome.hidden = true; };
        document.querySelectorAll('[data-ui-welcome]').forEach(button =>
            button.addEventListener('click', () => {
                chooseCategory(button.dataset.uiWelcome);
                dismissWelcome();
            })
        );
        $('#uiWelcomeDismiss').addEventListener('click', dismissWelcome);
        $('#uiWelcomeSkip').addEventListener('click', dismissWelcome);
        welcome.addEventListener('click', (event) => {
            if (event.target === welcome) dismissWelcome();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !welcome.hidden) dismissWelcome();
        });
        welcome.hidden = !preferences.showCategoryWelcome;

        // 快捷网址：仅在本地浏览器保存，不影响业务模块与其他用户。
        function validLink(nameInput, urlInput) {
            const name = nameInput.trim(), raw = urlInput.trim();
            if (!name || name.length > 40) throw new Error('名称需要 1–40 个字符');
            if (!raw || raw.length > 2048) throw new Error('请输入有效的网址');
            let url;
            try { url = new URL(raw); } catch (_) { throw new Error('请输入完整的 http(s) 网址'); }
            if (!['http:', 'https:'].includes(url.protocol) || !url.hostname)
                throw new Error('仅支持 http:// 或 https:// 网址');
            return { name, url: url.href };
        }
        function loadLinks() {
            try {
                const raw = localStorage.getItem(LINKS_STORAGE_KEY);
                if (raw === null) return DEFAULT_LINKS.map(x => ({...x}));
                const data = JSON.parse(raw);
                if (!Array.isArray(data)) throw Error('不是列表');
                return data.map(x => {
                    if (!x || typeof x.id !== 'string') return null;
                    try { return { id: x.id, ...validLink(String(x.name || ''), String(x.url || '')) }; }
                    catch (_) { return null; }
                }).filter(Boolean);
            } catch (error) {
                console.warn('[快捷网址] 读取失败，恢复初始列表', error);
                return DEFAULT_LINKS.map(x => ({...x}));
            }
        }
        let links = loadLinks(), editLinks = false, editingId = null;
        const linksList = $('#uiLinksList'), linkForm = $('#uiLinkForm');
        const nameField = $('#uiLinkName'), urlField = $('#uiLinkUrl');
        const addButton = $('#uiLinksAdd'), editButton = $('#uiLinksEdit'), status = $('#uiLinksStatus');
        function notify(text, error = false) {
            status.textContent = text;
            status.classList.toggle('is-error', error);
        }
        function persistLinks() {
            try { localStorage.setItem(LINKS_STORAGE_KEY, JSON.stringify(links)); return true; }
            catch (error) {
                console.error('[快捷网址] 保存失败', error);
                notify('保存失败，请检查浏览器存储权限', true);
                return false;
            }
        }
        function closeForm() { linkForm.hidden = true; linkForm.reset(); editingId = null; }
        function openForm(link) {
            editingId = link ? link.id : null;
            nameField.value = link ? link.name : '';
            urlField.value = link ? link.url : '';
            linkForm.hidden = false;
            nameField.focus();
        }
        function renderLinks() {
            linksList.replaceChildren();
            if (!links.length) {
                const empty = document.createElement('p');
                empty.className = 'ui-links-empty';
                empty.textContent = '还没有网址，可以点击「添加网址」。';
                linksList.append(empty);
            }
            for (const link of links) {
                const row = document.createElement('div');
                row.className = 'ui-link-row';
                const a = document.createElement('a');
                a.href = link.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
                a.title = link.url; a.className = 'ui-link-anchor';
                const mark = document.createElement('span');
                mark.className = 'ui-link-mark'; mark.textContent = '↗';
                const label = document.createElement('span');
                label.className = 'ui-link-name'; label.textContent = link.name;
                a.append(mark, label); row.append(a);
                if (editLinks) {
                    const actions = document.createElement('div');
                    actions.className = 'ui-link-actions';
                    const edit = document.createElement('button');
                    edit.type = 'button'; edit.textContent = '修改';
                    edit.setAttribute('aria-label', '修改 ' + link.name);
                    edit.addEventListener('click', () => openForm(link));
                    const del = document.createElement('button');
                    del.type = 'button'; del.textContent = '删除'; del.className = 'ui-link-delete';
                    del.setAttribute('aria-label', '删除 ' + link.name);
                    del.addEventListener('click', () => {
                        if (!window.confirm('删除「' + link.name + '」？')) return;
                        const prev = links;
                        links = links.filter(x => x.id !== link.id);
                        if (!persistLinks()) links = prev;
                        else notify('网址已删除');
                        if (editingId === link.id) closeForm();
                        renderLinks();
                    });
                    actions.append(edit, del); row.append(actions);
                }
                linksList.append(row);
            }
            editButton.textContent = editLinks ? '完成编辑' : '编辑网址';
            addButton.hidden = !editLinks;
        }
        editButton.addEventListener('click', () => {
            editLinks = !editLinks;
            closeForm();
            notify('');
            renderLinks();
        });
        addButton.addEventListener('click', () => { notify(''); openForm(null); });
        $('#uiLinkCancel').addEventListener('click', closeForm);
        linkForm.addEventListener('submit', event => {
            event.preventDefault();
            let value;
            try { value = validLink(nameField.value, urlField.value); }
            catch (error) { notify(error.message, true); return; }
            const prev = links;
            links = editingId
                ? links.map(link => link.id === editingId ? {...link, ...value} : link)
                : [...links, {id:'user-' + Date.now() + '-' + Math.random().toString(36).slice(2,7), ...value}];
            if (!persistLinks()) { links = prev; return; }
            closeForm(); renderLinks(); notify('保存成功');
        });
        renderLinks();

        // 与用户浏览器本地时间保持一致，不影响计算器与数据处理。
        const clock = $('#uiCurrentClock');
        const renderClock = () => {
            clock.textContent = new Date().toLocaleTimeString('zh-CN', { hour12: false,
                hour: '2-digit', minute: '2-digit', second: '2-digit' });
        };
        renderClock();
        setInterval(renderClock, 1000);

        updateModeAndSection();
        const activeSub = subTabs.querySelector('span.active');
        $('#uiCurrentCategory').textContent = activeSub ? activeSub.textContent.trim() : '舆情';
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootWorkspaceUI, { once: true });
    } else {
        bootWorkspaceUI();
    }

    function bootWorkspaceUI() {
        if (window.App && document.getElementById('uiWorkspace')) {
            initWorkspaceUI();
            return;
        }
        let retries = 0;
        const timer = setInterval(() => {
            if (window.App && document.getElementById('uiWorkspace')) {
                clearInterval(timer);
                initWorkspaceUI();
            } else if (++retries >= 60) {
                clearInterval(timer);
                console.error('[UI] 核心框架未就绪，工作台初始化取消');
            }
        }, 100);
    }
})(window, document);
