/**
 * extract-module.js - 文本提取器（双模式）
 *
 * 模式1（友商竞品）：解析“舆情补充/正面补充”文本，输出14列。（逻辑不变）
 * 模式2（一组）：分两个子功能：
 *   - 监测词 → BG/业务部门：解析监测词列表，输出 BG 和 业务部门 两列，空行保留。（映射逻辑不变）
 *   - 链接 → 作者/记者/编辑：粘贴一整列链接，调用后端 /extract_meta 爬取原文署名，
 *     输出 作者、记者、编辑 三列（Tab 分隔），行数与输入一一对应，空行/失败行保留空白，
 *     可直接整列粘贴回 Excel。
 * 修正：微信/QQ过滤规则——仅当同时匹配到“微信”及其衍生词时才移除“微信”，否则保留。
 */
(function(window) {
    'use strict';

    // ========== 公共映射数据 ==========
    const BG_MAPPING = [
        { bg: 'CDG', keywords: ['腾讯投资', '腾讯广告（AMS）', '腾讯金融科技（FIT）', '青腾大学', 'SSV'] },
        { bg: 'TEG', keywords: ['客户服务部', 'AI Infra部', 'AI Data部', '数据计算平台部'] },
        { bg: 'IEG', keywords: ['腾讯互动娱乐', '天美工作室群', '光子工作室群', '天美电竞', '腾讯未保体系', '腾讯电竞', 'IEG公关', '魔方工作室群'] },
        { bg: 'PCG', keywords: ['QQ', 'QQ空间', '应用宝', '腾讯视频', '企鹅号', '腾讯文档'] },
        { bg: 'WXG', keywords: ['微信', '企业微信', '小游戏', '微信公众平台', '微信外链', '朋友圈', '微信支付', '视频号', '微信读书', '微信AI', '智慧零售/交通/商圈/酒店/医疗', '微信小程序'] },
        { bg: 'CSIG', keywords: ['云', 'workbuddy', '腾讯混元', '腾讯元宝', 'IMA', '腾讯+龙虾', '腾讯+token', '姚顺雨', '腾讯+AI智能体'] },
        { bg: 'S线', keywords: ['雇主品牌', '安全管理部', '西南总部', '腾讯公益', '华东总部', '知识产权', '法务', '腾讯研究院', 'HR', '腾讯学院', '腾讯青年发展委员会'] }
    ];
    const KEYWORD_TO_BG = {};
    BG_MAPPING.forEach(item => {
        item.keywords.forEach(kw => {
            const parts = kw.split(/[、，,]/).map(s => s.trim()).filter(Boolean);
            parts.forEach(p => {
                if (!KEYWORD_TO_BG[p]) KEYWORD_TO_BG[p] = [];
                if (!KEYWORD_TO_BG[p].includes(item.bg)) KEYWORD_TO_BG[p].push(item.bg);
            });
        });
    });

    // ========== 模式2映射表 ==========
    const MAPPING_TEXT = `
BG	部门标签	监测词 （用逗号将监测词隔开）
CDG	腾讯投资	腾讯投资、腾讯财报、腾讯年报
CDG	腾讯广告（AMS）	朋友圈广告 、微信广告、腾讯广告
CDG	腾讯金融科技（FIT）	财付通、理财通、腾讯征信、腾讯+互联网金融、腾讯+区块链、腾讯微保、腾讯+金融科技
CDG	青腾大学	青腾大学、青腾汇、腾讯青腾
CDG	SSV	腾讯可持续社会价值事业部、腾讯SSV、腾讯+时光实验室、腾讯+数字教育实验室、腾讯+数字文化实验室、新基石研究员、科学探索奖、企鹅急救助手、腾讯+乡村CEO
CDG	/	腾讯、tencent
TEG	客户服务部	腾讯客服、腾讯未成年人保护营地、腾讯游戏客服、腾讯客服银龄服务基地、微信支付客服、腾讯卫士
TEG	AI Infra部	AI Infra部
TEG	AI Data部	AI Data部
TEG	数据计算平台部	数据计算平台部
IEG	腾讯互动娱乐	腾讯+互娱，腾讯游戏，腾讯+一起来捉妖，Switch+国行，腾讯+TGC、腾讯+up+大会、腾讯+绝悟、腾讯动捕基地
IEG	天美工作室群	天美工作室，腾讯+王者荣耀，腾讯+QQ飞车，腾讯+农药，腾讯+使命召唤、元梦之星、三角洲行动、王者荣耀世界
IEG	光子工作室群	光子工作室，和平精英，腾讯+刺激战场，腾讯+吃鸡，pubg，pubgm
IEG	天美电竞	KPL，天美+电竞
IEG	腾讯未保体系	腾讯+未保、腾讯+未成年人保护、腾讯+防沉迷、腾讯+限玩日历、未成年+充值、未成年+沉迷、游戏+充值、游戏+沉迷、腾讯+游戏+退费、腾讯+游戏+沉迷、腾讯成长守护、智体双百、触梦计划
IEG	腾讯电竞	腾讯电竞，英雄联盟+赛事，LPL，企鹅电竞，王者荣耀+城市赛，王者荣耀+大众赛，和平精英+电竞，和平精英+联赛，PEL，穿越火线+电竞，穿越火线+联赛，CFPL
IEG	IEG公关	AI in game，AI for game，中国游戏产业年会
IEG	魔方工作室群	腾讯+魔方，魔方工作室，腾讯+火影忍者，腾讯+暗区突围
PCG	QQ	QQ
PCG	QQ空间	QQ空间
PCG	应用宝	吐司、Marvis（马维斯）、应用宝
PCG	腾讯视频	腾讯视频
PCG	企鹅号	企鹅号、腾讯内容开放平台、腾讯创作服务平台
PCG	腾讯文档	腾讯文档
WXG	微信	微信、WeChat
WXG	企业微信	企业微信、政务微信、腾讯企业邮箱、WeCom
WXG	小游戏	微信+小游戏
WXG	微信公众平台	微信公众号、 微信订阅号、微信付费阅读
WXG	微信外链	微信外链、微信外部链接
WXG	朋友圈	微信+朋友圈
WXG	微信支付	微信支付
WXG	视频号	微信视频号、微信电商直播、视频号直播
WXG	微信读书	微信读书
WXG	微信AI	微信AI
WXG	智慧零售/交通/商圈/酒店/医疗	微信+(智慧零售|交通|商圈|酒店|医疗)
WXG	微信小程序	微信小程序
CSIG	云	腾讯云、workbuddy、腾讯混元、腾讯元宝、IMA、腾讯+龙虾、腾讯+token、姚顺雨、腾讯+AI智能体
S线	雇主品牌	腾讯+招聘、腾讯+实习生、腾讯+青云计划、腾讯+青云奖学金
S线	安全管理部	腾讯+反诈，企鹅伴成长，腾讯+护苗，腾讯+安全管理，腾讯+黑产，腾讯+春蕾
S线	西南总部	腾讯+西南总部、腾讯+重庆，腾讯+四川，腾讯+成都，腾讯+贵阳，腾讯+贵安数据中心
S线	腾讯公益	腾讯公益慈善基金会，腾讯公益平台，99公益日，腾讯+科技向善+公益，腾讯+小红花
S线	华东总部	华东总部+腾讯，腾讯副总裁李侃，上海+腾讯
S线	知识产权	腾讯+专利，腾讯＋知识产权
S线	法务	腾讯+版权保护，腾讯+数据保护，腾讯+隐私保护
S线	腾讯研究院	腾讯研究院
S线	HR	腾讯Mini鹅创想营
S线	腾讯学院	腾讯+青科实训营
S线	腾讯青年发展委员会	腾讯青年发展委员会、腾讯+英才计划
`;

    function parseMapping(text) {
        const lines = text.split('\n');
        const items = [];
        for (let i = 1; i < lines.length; i++) {
            let line = lines[i].trim();
            if (!line) continue;
            let parts = line.split('\t');
            if (parts.length < 3) parts = line.split(/\s{2,}/);
            if (parts.length < 3) continue;
            const bg = parts[0].trim();
            const dept = parts[1].trim();
            const keywords = parts[2].trim();
            const kwList = keywords.split(/[、，,]\s*/).map(s => s.trim()).filter(Boolean);
            kwList.forEach(kw => {
                if (kw === 'IMA') kw = '腾讯+IMA';
                items.push({ bg, dept, keyword: kw });
            });
        }
        return items;
    }
    const MONITOR_MAPPING_ITEMS = parseMapping(MAPPING_TEXT);

    // ========== 模式2匹配函数（修正含 '+' 和 '|' 的处理） ==========
    function matchKeyword(text, keyword) {
        const textLower = text.toLowerCase();
        const keywordLower = keyword.toLowerCase();

        if (!keywordLower.includes('+') && !keywordLower.includes('|')) {
            return textLower.includes(keywordLower);
        }

        if (keywordLower.includes('+') && !keywordLower.includes('|')) {
            const merged = keywordLower.replace(/\+/g, '');
            return textLower.includes(merged);
        }

        if (keywordLower.includes('|')) {
            const openParen = keywordLower.indexOf('(');
            const closeParen = keywordLower.lastIndexOf(')');
            if (openParen === -1 || closeParen === -1 || closeParen < openParen) {
                const stripped = keywordLower.replace(/\+/g, '');
                const parts = stripped.split('|');
                return parts.some(part => textLower.includes(part));
            }
            let base = keywordLower.substring(0, openParen);
            base = base.replace(/\+/g, '').trim();
            const options = keywordLower.substring(openParen + 1, closeParen).split('|').map(s => s.trim()).filter(Boolean);
            for (const opt of options) {
                const combined = base + opt;
                if (textLower.includes(combined)) {
                    return true;
                }
            }
            return false;
        }
        return false;
    }

    function matchMonitorItems(text, items) {
        if (!text) return [];
        const matched = [];
        items.forEach(item => {
            if (matchKeyword(text, item.keyword)) {
                matched.push({ bg: item.bg, dept: item.dept, keyword: item.keyword });
            }
        });
        return matched;
    }

    // ========== 模式2处理（保留空行，应用CDG规则，精确过滤微信/QQ衍生） ==========
    // 定义微信衍生词列表（部门标签）
    const WX_DERIVATIVES = ['企业微信', '小游戏', '微信公众平台', '微信外链', '朋友圈', '微信支付', '视频号', '微信读书', '微信AI', '智慧零售/交通/商圈/酒店/医疗', '微信小程序'];
    const QQ_DERIVATIVES = ['QQ空间'];

    function processMonitorLinesWithEmpty(lines) {
        const results = [];
        lines.forEach(line => {
            const trimmed = line.trim();
            if (trimmed === '') {
                results.push({ bg: '', dept: '' });
                return;
            }
            const words = trimmed.split(/[，,]\s*/).map(s => s.trim()).filter(Boolean);
            let allMatched = [];
            words.forEach(word => {
                const matched = matchMonitorItems(word, MONITOR_MAPPING_ITEMS);
                allMatched = allMatched.concat(matched);
            });

            // CDG 特殊规则
            const cdgTriggeredByTencent = allMatched.some(item =>
                item.bg === 'CDG' && (item.keyword === '腾讯' || item.keyword.toLowerCase() === 'tencent')
            );
            const hasOtherBG = allMatched.some(item => item.bg !== 'CDG');
            if (cdgTriggeredByTencent && hasOtherBG) {
                allMatched = allMatched.filter(item =>
                    !(item.bg === 'CDG' && (item.keyword === '腾讯' || item.keyword.toLowerCase() === 'tencent'))
                );
            }

            const bgSet = new Set();
            const deptSet = new Set();
            allMatched.forEach(item => {
                bgSet.add(item.bg);
                if (item.dept !== '/') {
                    deptSet.add(item.dept);
                }
            });

            let bgArray = Array.from(bgSet).sort();
            let deptArray = Array.from(deptSet).sort();

            // 仅CDG且无部门时输出 '/'
            if (bgArray.length === 1 && bgArray[0] === 'CDG' && deptArray.length === 0) {
                deptArray = ['/'];
            }

            // 过滤微信：如果同时有 "微信" 和微信衍生词，则移除 "微信"
            if (deptArray.includes('微信')) {
                const hasDerivative = deptArray.some(d => WX_DERIVATIVES.includes(d));
                if (hasDerivative) {
                    deptArray = deptArray.filter(d => d !== '微信');
                }
            }
            // 过滤QQ：如果同时有 "QQ" 和 QQ衍生词，则移除 "QQ"
            if (deptArray.includes('QQ')) {
                const hasDerivative = deptArray.some(d => QQ_DERIVATIVES.includes(d));
                if (hasDerivative) {
                    deptArray = deptArray.filter(d => d !== 'QQ');
                }
            }

            results.push({
                bg: bgArray.join(','),
                dept: deptArray.join(',')
            });
        });
        return results;
    }

    // ========== 模式1函数（保持不变） ==========
    function cleanColumnName(col) {
        return col.replace(/[（(][^）)]*[）)]/g, '').trim();
    }

    const DURATION_MAP = {
        'CCTV12(社会与法频道)|中国法治观察': 30,
        'CCTV2(财经频道)|第一时间': 120,
        'CCTV2(财经频道)|正点财经': 60,
        'CCTV13(新闻频道)|共同关注': 60,
        'CCTV13(新闻频道)|东方时空': 60,
        'CCTV2(财经频道)|经济信息联播': 60,
        'CCTV13(新闻频道)|新闻1+1': 30,
        'CCTV13(新闻频道)|新闻直播间': 60,
        'CCTV13(新闻频道)|朝闻天下': 60,
        'CCTV13(新闻频道)|法治在线': 26,
        'CCTV2(财经频道)|消费主张': 30,
        'CCTV2(财经频道)|天下财经': 60,
        '视频号|央视频': null,
        'CCTV2(财经频道)|对话': 46,
        'CCTV13(新闻频道)|新闻周刊': 45,
        'CCTV2(财经频道)|财经调查': 30,
        'CCTV1(综合频道)|晚间新闻': 30,
        'CCTV1(综合频道)|焦点访谈': 30,
        'CCTV1(综合频道)|今日说法': 30,
        'CCTV1(综合频道)|新闻联播': 30,
        'CCTV1(综合频道)|新闻30分': 30
    };

    function getFixedDuration(channel, column) {
        const colClean = cleanColumnName(column);
        const key = channel + '|' + colClean;
        const val = DURATION_MAP[key];
        if (val !== undefined && val !== null) return val;
        return null;
    }

    function parseDurationToSeconds(durationStr) {
        const match = durationStr.match(/(\d+)'(\d+)"/);
        if (match) {
            const mins = parseInt(match[1]);
            const secs = parseInt(match[2]);
            return mins * 60 + secs;
        }
        return 0;
    }

    function extractBracketContent(text) {
        const matches = text.match(/[（(][^）)]*[）)]/g);
        if (!matches || matches.length === 0) return null;
        const last = matches[matches.length - 1];
        let content = last.replace(/[（(]/, '').replace(/[）)]/, '');
        content = content.replace(/^(提及|露出|画面露出|露出画面)\s*/, '').trim();
        return content || null;
    }

    function mapToBG(bracketText) {
        if (!bracketText) return '';
        const bgs = new Set();
        Object.keys(KEYWORD_TO_BG).forEach(kw => {
            if (bracketText.includes(kw)) {
                KEYWORD_TO_BG[kw].forEach(bg => bgs.add(bg));
            }
        });
        return Array.from(bgs).sort().join('、');
    }

    function extractFields(text) {
        const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
        if (lines.length === 0) return null;

        let channel = '', column = '', broadcastTime = '', durationStr = '', exposeDuration = '', reporter = '', summary = '';
        let links = [], titles = [];
        let rawText = text;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.startsWith('频道：') || line.startsWith('频道:')) {
                channel = line.replace(/^频道[：:]/, '').trim();
            } else if (line.startsWith('栏目：') || line.startsWith('栏目:')) {
                column = line.replace(/^栏目[：:]/, '').trim();
            } else if (/^标题\d*[：:]/.test(line)) {
                const titleText = line.replace(/^标题\d*[：:]/, '').trim();
                if (titleText) titles.push(titleText);
            } else if (line.startsWith('播出时间：') || line.startsWith('播出时间:')) {
                broadcastTime = line.replace(/^播出时间[：:]/, '').trim();
            } else if (line.startsWith('新闻时长：') || line.startsWith('新闻时长:')) {
                durationStr = line.replace(/^新闻时长[：:]/, '').trim();
            } else if (line.startsWith('露出时长：') || line.startsWith('露出时长:')) {
                exposeDuration = line.replace(/^露出时长[：:]/, '').trim();
            } else if (line.startsWith('记者：') || line.startsWith('记者:')) {
                reporter = line.replace(/^记者[：:]/, '').trim();
            } else if (line.startsWith('摘要：') || line.startsWith('摘要:')) {
                summary = line.replace(/^摘要[：:]/, '').trim();
            } else if (/^链接\d*[：:]/.test(line)) {
                const linkText = line.replace(/^链接\d*[：:]/, '').trim();
                if (linkText) links.push(linkText);
            }
        }

        if (titles.length > 0) {
            titles = [...new Set(titles)];
        } else if (summary) {
            const firstSentence = summary.split(/[，,。.！!？?]/)[0];
            if (firstSentence) titles.push(firstSentence);
        }

        const mergedTitle = titles.join(' ');
        const mergedLinks = links.join(' ');

        let durationMinutes = getFixedDuration(channel, column);
        let startTime = '', endTime = '';

        if (durationMinutes === null) {
            const timeMatch = broadcastTime.match(/(\d{8})\s+(\d{2}:\d{2}:\d{2})\s*-\s*(\d{2}:\d{2}:\d{2})/);
            if (timeMatch) {
                startTime = timeMatch[2];
                endTime = timeMatch[3];
                const startParts = startTime.split(':').map(Number);
                const endParts = endTime.split(':').map(Number);
                const startTotal = startParts[0]*3600 + startParts[1]*60 + startParts[2];
                const endTotal = endParts[0]*3600 + endParts[1]*60 + endParts[2];
                const diffSeconds = endTotal - startTotal;
                if (diffSeconds > 0) {
                    durationMinutes = Math.ceil(diffSeconds / 60);
                }
            } else if (durationStr) {
                const durMatch = durationStr.match(/(\d+)'(\d+)"/);
                if (durMatch) {
                    const mins = parseInt(durMatch[1]);
                    const secs = parseInt(durMatch[2]);
                    durationMinutes = Math.ceil(mins + secs/60);
                }
            }
            if (!durationMinutes || durationMinutes <= 0) durationMinutes = 1;
        } else {
            const timeMatch = broadcastTime.match(/(\d{8})\s+(\d{2}:\d{2}:\d{2})\s*-\s*(\d{2}:\d{2}:\d{2})/);
            if (timeMatch) {
                startTime = timeMatch[2];
                endTime = timeMatch[3];
            } else {
                const startMatch = broadcastTime.match(/(\d{2}:\d{2}:\d{2})/);
                if (startMatch) startTime = startMatch[1];
            }
        }

        let exposeSeconds = 0;
        if (exposeDuration) {
            exposeSeconds = parseDurationToSeconds(exposeDuration);
        }

        const now = new Date();
        const dateStr = `${now.getMonth()+1}月${now.getDate()}日`;

        let category = '中性';
        if (rawText.includes('正面补充')) {
            category = '正面';
        } else if (rawText.includes('舆情补充')) {
            category = '负面';
        }

        const cleanColumn = cleanColumnName(column);
        let bracketContent = '';
        const lastBracket = extractBracketContent(rawText);
        if (lastBracket) bracketContent = lastBracket;
        const mappedBG = mapToBG(bracketContent);

        return {
            date: dateStr,
            durationMinutes: durationMinutes,
            channel: channel || '—',
            column: cleanColumn || '—',
            exposeSeconds: exposeSeconds,
            broadcastTime: `${startTime} - ${endTime}`,
            title: mergedTitle || '—',
            links: mergedLinks || '—',
            category: category,
            bracketContent: bracketContent,
            mappedBG: mappedBG
        };
    }

    // ========== 新增：链接 → 作者/记者/编辑（后端爬取） ==========
    const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:5000'
        : '/news-api';
    const LINK_BATCH_SIZE = 50; // 每批请求的链接数（含空占位），避免超时

    /**
     * 批量爬取链接署名。
     * @param {string[]} links 与输入行一一对应的链接数组（空字符串占位）
     * @param {function} onProgress 进度回调 (done, total)
     * @returns {Promise<Array<{author:string,reporter:string,editor:string,error:string}>>}
     */
    async function fetchLinkMeta(links, onProgress) {
        const results = new Array(links.length);
        for (let start = 0; start < links.length; start += LINK_BATCH_SIZE) {
            const batch = links.slice(start, start + LINK_BATCH_SIZE);
            try {
                const res = await fetch(`${API_BASE}/extract_meta`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ links: batch })
                });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const data = await res.json();
                const items = (data && data.results) || [];
                for (let i = 0; i < batch.length; i++) {
                    const r = items[i] || {};
                    results[start + i] = {
                        author: r.author || '',
                        reporter: r.reporter || '',
                        editor: r.editor || '',
                        error: r.error || ''
                    };
                }
            } catch (e) {
                // 整批失败：该批全部置空并标记错误
                for (let i = 0; i < batch.length; i++) {
                    results[start + i] = { author: '', reporter: '', editor: '', error: '请求失败' };
                }
            }
            if (onProgress) onProgress(Math.min(start + LINK_BATCH_SIZE, links.length), links.length);
        }
        return results;
    }

    // ========== 模块主体 ==========
    const module = {
        name: 'extract',
        container: null,
        _busy: false,

        init(container, App) {
            this.container = container;
            this.App = App;
            this.render();
        },

        activate(App) {
            this.App = App;
            this.render();
        },

        destroy() {
            if (this.container) this.container.innerHTML = '';
        },

        render() {
            const con = this.container;
            con.innerHTML = `
                <div style="padding:20px;max-width:900px;margin:0 auto;">
                    <h4 style="margin-top:0;">📋 文本提取器</h4>
                    <div style="margin-bottom:12px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
                        <label style="font-weight:500;">模式：</label>
                        <select id="modeSelect" style="padding:4px 8px;border:1px solid #ddd;border-radius:4px;">
                            <option value="friend">友商竞品</option>
                            <option value="group">一组</option>
                        </select>
                        <div id="groupSubTabs" style="display:none;gap:6px;">
                            <button class="ext-subtab active" data-sub="monitor">监测词 → BG/部门</button>
                            <button class="ext-subtab" data-sub="link">链接 → 作者/记者/编辑</button>
                        </div>
                        <span id="modeHint" style="font-size:13px;color:#888;">粘贴【央视舆情补充】或【央视正面补充】文本</span>
                    </div>
                    <div style="margin-bottom:12px;">
                        <label style="display:block;font-weight:500;">输入：</label>
                        <textarea id="extractInput" style="width:100%;height:300px;padding:8px;border:1px solid #ddd;border-radius:6px;font-family:monospace;font-size:13px;" placeholder="请根据当前模式粘贴对应内容"></textarea>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                        <button class="btn btn-primary" id="parseBtn">🔍 解析</button>
                        <button class="btn btn-success" id="copyBtn">📋 复制结果</button>
                        <button class="btn btn-light" id="clearBtn">🧹 清空</button>
                        <span id="extractStatus" style="font-size:13px;color:#888;"></span>
                    </div>
                    <div style="margin-top:12px;">
                        <label style="display:block;font-weight:500;">解析结果（Tab 分隔，可直接粘贴到 Excel）：</label>
                        <textarea id="extractOutput" style="width:100%;height:160px;padding:8px;border:1px solid #ddd;border-radius:6px;font-family:monospace;font-size:13px;background:#f9f9f9;" readonly></textarea>
                    </div>
                    <div style="margin-top:8px;font-size:13px;color:#666;" id="outputHint">
                        📌 输出列：日期 | 栏目时长 | 频道 | 栏目 | 露出时长 | 播出时间 | 标题 | 链接 | 分类 | 无关 | 无关 | 空 | 括号内容 | 映射BG
                    </div>
                </div>
            `;

            const modeSelect = document.getElementById('modeSelect');
            const groupSubTabs = document.getElementById('groupSubTabs');
            const modeHint = document.getElementById('modeHint');
            const outputHint = document.getElementById('outputHint');
            const inputArea = document.getElementById('extractInput');
            const outputArea = document.getElementById('extractOutput');
            const parseBtn = document.getElementById('parseBtn');
            const copyBtn = document.getElementById('copyBtn');
            const clearBtn = document.getElementById('clearBtn');
            const statusEl = document.getElementById('extractStatus');

            let groupSub = 'monitor'; // 一组子模式：monitor | link

            const updateHints = () => {
                if (modeSelect.value === 'friend') {
                    groupSubTabs.style.display = 'none';
                    modeHint.textContent = '粘贴【央视舆情补充】或【央视正面补充】文本，输出14列。';
                    outputHint.textContent = '📌 输出列：日期 | 栏目时长 | 频道 | 栏目 | 露出时长 | 播出时间 | 标题 | 链接 | 分类 | 无关 | 无关 | 空 | 括号内容 | 映射BG';
                    inputArea.placeholder = '请粘贴舆情补充/正面补充文本';
                } else {
                    groupSubTabs.style.display = 'inline-flex';
                    if (groupSub === 'monitor') {
                        modeHint.textContent = '粘贴监测词列表（每行一条，多个词用逗号分隔），输出 BG 和 业务部门 两列。含+和|的关键词仅匹配连续字符串。';
                        outputHint.textContent = '📌 输出列：BG | 业务部门（行数与输入一一对应，空行保留）';
                        inputArea.placeholder = '从 Excel 整列复制监测词粘贴到这里';
                    } else {
                        modeHint.textContent = '从 Excel 整列复制“链接”列粘贴（每行一个链接），自动爬取原文提取署名。';
                        outputHint.textContent = '📌 输出列：作者 | 记者 | 编辑（行数与输入一一对应，空行/抓取失败行留空，可整列粘贴回 Excel）';
                        inputArea.placeholder = '每行一个链接，空行保留占位\nhttps://example.com/news1\n\nhttps://example.com/news2';
                    }
                }
                outputArea.value = '';
                statusEl.textContent = '';
            };

            modeSelect.addEventListener('change', updateHints);

            groupSubTabs.querySelectorAll('.ext-subtab').forEach(btn => {
                btn.addEventListener('click', () => {
                    groupSubTabs.querySelectorAll('.ext-subtab').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    groupSub = btn.dataset.sub;
                    updateHints();
                });
            });

            parseBtn.addEventListener('click', async () => {
                if (this._busy) return;
                const mode = modeSelect.value;
                const input = inputArea.value;
                if (!input.trim()) {
                    message('请输入内容', 'warning');
                    return;
                }
                let result = '';
                if (mode === 'friend') {
                    const parsed = extractFields(input);
                    if (!parsed) {
                        outputArea.value = '解析失败，请检查文本格式';
                        return;
                    }
                    const fields = [
                        parsed.date,
                        parsed.durationMinutes,
                        parsed.channel,
                        parsed.column,
                        parsed.exposeSeconds,
                        parsed.broadcastTime,
                        parsed.title,
                        parsed.links,
                        parsed.category,
                        '无关',
                        '无关',
                        '',
                        parsed.bracketContent,
                        parsed.mappedBG
                    ];
                    result = fields.join('\t');
                    outputArea.value = result;
                } else if (groupSub === 'monitor') {
                    const lines = input.split('\n');
                    const results = processMonitorLinesWithEmpty(lines);
                    const outputRows = results.map(r => r.bg + '\t' + r.dept);
                    result = outputRows.join('\n');
                    outputArea.value = result;
                } else {
                    // 链接 → 作者/记者/编辑
                    let lines = input.split('\n');
                    // 仅去掉末尾一个多余空行（Excel 复制常带），中间空行全部保留占位
                    if (lines.length > 1 && lines[lines.length - 1].trim() === '') lines = lines.slice(0, -1);
                    const links = lines.map(l => l.trim());
                    const validCount = links.filter(l => l && l.toLowerCase().startsWith('http')).length;
                    if (validCount === 0) {
                        message('未检测到有效链接（需以 http/https 开头）', 'warning');
                        return;
                    }
                    this._busy = true;
                    parseBtn.disabled = true;
                    parseBtn.textContent = '⏳ 爬取中...';
                    statusEl.textContent = `共 ${links.length} 行（有效链接 ${validCount} 条），开始爬取...`;
                    try {
                        const metas = await fetchLinkMeta(links, (done, total) => {
                            statusEl.textContent = `爬取进度：${done}/${total} 行`;
                        });
                        const rows = metas.map(m => [m.author, m.reporter, m.editor].join('\t'));
                        outputArea.value = rows.join('\n');
                        const filled = metas.filter(m => m.author || m.reporter || m.editor).length;
                        const errMetas = metas.filter((m, i) => links[i] && links[i].toLowerCase().startsWith('http') && m.error);
                        const failed = errMetas.length;
                        const cats = { req: 0, skip: 0, http: 0, net: 0, parse: 0, other: 0 };
                        errMetas.forEach(m => {
                            const e = m.error || '';
                            if (e === '请求失败') cats.req++;
                            else if (e.includes('skipped')) cats.skip++;
                            else if (e.includes('HTTP ')) cats.http++;
                            else if (e.includes('网络错误')) cats.net++;
                            else if (e.includes('parse error')) cats.parse++;
                            else cats.other++;
                        });
                        let summary = `✅ 完成：${links.length} 行，提取到署名 ${filled} 行`;
                        const parts = [];
                        if (cats.req) parts.push(`${cats.req} 条请求失败(后端不可达)`);
                        if (cats.skip) parts.push(`${cats.skip} 条被跳过(反爬域名)`);
                        if (cats.http) parts.push(`${cats.http} 条被站点拦截(HTTP 403/5xx)`);
                        if (cats.net) parts.push(`${cats.net} 条网络错误(服务器可能出不了公网)`);
                        if (cats.parse) parts.push(`${cats.parse} 条解析异常`);
                        if (cats.other) parts.push(`${cats.other} 条其他`);
                        if (parts.length) summary += `；失败 ${failed} 条：${parts.join('，')}`;
                        statusEl.textContent = summary;
                    } catch (e) {
                        statusEl.textContent = '❌ 爬取失败：' + e.message;
                    } finally {
                        this._busy = false;
                        parseBtn.disabled = false;
                        parseBtn.textContent = '🔍 解析';
                    }
                }
            });

            copyBtn.addEventListener('click', () => {
                if (!outputArea.value || outputArea.value === '解析失败，请检查文本格式' || outputArea.value === '请输入至少一行监测词' || outputArea.value === '未匹配到任何结果') {
                    message('没有可复制的内容，请先解析', 'warning');
                    return;
                }
                navigator.clipboard.writeText(outputArea.value).then(() => {
                    message('✅ 已复制到剪贴板（Tab分隔）', 'success');
                }).catch(() => {
                    outputArea.select();
                    document.execCommand('copy');
                    message('✅ 已复制到剪贴板', 'success');
                });
            });

            clearBtn.addEventListener('click', () => {
                inputArea.value = '';
                outputArea.value = '';
                statusEl.textContent = '';
            });

            updateHints();
        }
    };

    window.__modules = window.__modules || {};
    window.__modules['extract'] = module;
})(window);
