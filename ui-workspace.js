/**
 * ui-workspace.js — 视觉与布局协调层（不修改原有模块、事件总线、存储契约）
 * 所有业务操作仍交由 core.js 和 modules/*.js 处理。
 */
(function (window, document) {
    'use strict';

    const UI_STORAGE_KEY = 'cmswrap_ui_layout_v2';
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
        const settingsClose = $('#uiSettingsClose');
        const timeButton = $('#uiTimeToolsBtn');
        const modeButtons = Array.from(document.querySelectorAll('[data-ui-mode]'));
        const showNoteCheckbox = $('#uiShowScratchpad');
        const showImageCheckbox = $('#uiShowImagepad');
        const utilityTitle = $('#uiUtilityTitle');
        const currentSection = $('#uiCurrentSection');
        const originalTabs = $('#mainTabs');
        const rightDock = $('.ui-right-dock');

        let preferences = { showScratchpad: true, showImagepad: true };
        try {
            const saved = JSON.parse(localStorage.getItem(UI_STORAGE_KEY) || '{}');
            if (typeof saved.showScratchpad === 'boolean') preferences.showScratchpad = saved.showScratchpad;
            if (typeof saved.showImagepad === 'boolean') preferences.showImagepad = saved.showImagepad;
        } catch (error) {
            console.debug('[UI] 无法读取显示偏好', error);
        }

        let settingsOpen = false;
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
            const active = settingsOpen ? 'settings' : noteIsOpen ? 'note' : imageIsOpen ? 'image' : '';
            body.dataset.uiDock = active;
            body.classList.toggle('ui-dock-open', Boolean(active));
            settingsPanel.hidden = !settingsOpen;
            settingsTrigger.setAttribute('aria-expanded', String(settingsOpen));
            railSettings.setAttribute('aria-expanded', String(settingsOpen));
            noteToggle()?.classList.toggle('is-selected', active === 'note');
            imageToggle()?.classList.toggle('is-selected', active === 'image');
            railSettings.classList.toggle('is-selected', active === 'settings');
        }

        function openSettings(next) {
            settingsOpen = next;
            if (settingsOpen) {
                closeOtherFloatingPanel(null);
                closeLeft();
            }
            applyDockState();
        }

        function toggleNoteOrImage(type) {
            settingsOpen = false;
            if (type === 'note' && notePanel()?.classList.contains('show')) {
                closeOtherFloatingPanel('note');
            } else if (type === 'image' && imagePanel()?.classList.contains('show')) {
                closeOtherFloatingPanel('image');
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
            if (note && note.parentElement !== rightDock) rightDock.insertBefore(note, railSettings);
            if (image && image.parentElement !== rightDock) rightDock.insertBefore(image, railSettings);

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
        });

        window.App.EventBus.on('tabChange', () => {
            utilityOpen = false;
            closeLeft();
            updateModeAndSection();
        });

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
