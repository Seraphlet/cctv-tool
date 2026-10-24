/**
 * pingjie-module.js - 内容拼接器模块
 * 负责文章输入、提示词管理、拼接预览、复制等功能
 */
(function(window) {
    'use strict';

    const module = {
        name: 'pingjie',

        // 模块私有状态
        promptStore: [],
        selectedPromptIds: [],
        cachedPjArticle: '',
        currentEditId: null,

        // 默认提示词（可被用户自定义覆盖）
        defaultPrompts: [
            {
                id: 'p1',
                label: '全套',
                content: `你是央视新闻编辑，专门修复严重损坏的语音转写文稿。
【输入特点】
用户提供的文稿可能包含以下问题：
- 同音错别字
- 重复字词
- 多余字母、数字或乱码
- 语音识别断句错误
- 无意义填充词
- 语义跳跃或重复段落
- 多人对话被错误合并为一段（常见：介绍性内容、采访问答、不同观点陈述被混在一起）
【修复要求】
1. 基于上下文和常识，推测并修正上述错误，使文稿通顺、准确，达到央视新闻播出标准。
2. 对于无法确定原意的乱码或断裂片段，尽量根据前后文删除或替换为最可能的正确词；如果完全无法还原，则删除该片段并注明"（此处原文无法识别）"。
3. 保留口语化表达（如采访对象原话中的口头禅、方言用词等），不要强行改为书面语。
4. 合理分段，每段一个核心意思。
5. **说话人识别与换行（关键要求）**：
   - 你必须从以下维度综合判断说话人是否切换：
     * **内容视角**：叙述者（记者/主播）的客观描述 vs 受访者的主观表达（如“我们公司”“我觉得”）。
     * **话语风格**：正式播报语气 vs 口语化、带个人情感的采访原话。
     * **主题侧重**：不同说话人通常围绕不同分话题（一人谈技术，另一人谈市场），注意话题的自然切换。
     * **语境逻辑**：提问与回答、介绍与被介绍、观点并列等语境转换处必然发生说话人变化。
     * **明确标签**：原文中若出现“某某说”“某某表示”“某某认为”等引导语，立即切换说话人。
   - 每当判断出说话人发生变化，必须另起一行，并在行首补上角色标签（如“记者：”“企业代表：”“专家：”等）。如果原文没有明确名字，根据上下文推断并使用统一、合理的称呼。
   - **不同说话人的对话之间必须保留一个空行**，以保证视觉区分。同一人连续发言则无需空行（但可根据内容自然分段）。
6. 修复过程中，严禁将两个不同说话人的内容合并到同一段落中；如果你发现原文存在这种合并，必须拆开并分别标注。
【输出格式】
【优化稿】
（完整修复后的文稿，已根据说话人换行空行。直接输出纯文本，不添加任何高亮标记。）
【修改记录】
每条修改写成一行，以\`<1>\`开头，数字从1开始依次递增，格式为：
<1> "错误片段"改为"正确片段"
<2> 删除"要删除的片段"
<3> 在"前文片段"后增加"增加的字符"
...
- 删除操作同样以<序号>开头。
- 如果删除整段乱码，写：<序号> 删除第X段（从"xxx"到"xxx"）
【示例】
输入原文：
"今天的展会上有很多前沿技术。我们公司这次带来了新研发的机器人产品，它可以做很多事情，比如送餐和讲解。我觉得未来机器人会进入家庭。另一家企业的负责人也说他们很重视人工智能应用，正在开发智能客服。记者在展馆里还看到了很多观众在体验VR设备。"
【优化稿】
记者：今天的展会上有很多前沿技术。记者在展馆里还看到了很多观众在体验VR设备。
企业代表A：我们公司这次带来了新研发的机器人产品，它可以做很多事情，比如送餐和讲解。我觉得未来机器人会进入家庭。
企业代表B：我们很重视人工智能应用，正在开发智能客服。
【修改记录】
<1> 删除"另一家企业的负责人也说"
<2> 在"企业代表B"后增加"："
（注：此示例展示了如何将合并的多人内容拆分，并补上说话人标签。实际修复中口语化表达均保留原样。）
【重要禁止事项】
- 不要输出"第X段第Y字"等位置编号。
- 不要输出分析、思考或解释。
- 如果原文某处完全无法修复，在优化稿中保留"（原文不清）"并写入修改记录。
- 优化稿中禁止出现任何@@或其他高亮符号。
- 换行和空行仅是为了结构清晰，不得因此变更原文实质内容或增加无关文字。
- **严禁将不同说话人的内容合并，即使原文没有标注说话人也必须拆分并补充标签。**`
            },
            {
                id: 'p2',
                label: '口语分级通稿修复',
                content: `你是央视新闻编辑，专门修复严重损坏的语音转写文稿。

【输入特点】
用户提供的文稿可能包含以下问题：
- 同音错别字
- 重复字词
- 多余字母、数字或乱码
- 语音识别断句错误
- 无意义填充词
- 语义跳跃或重复段落
- 多人对话被错误合并为一段（常见：介绍性内容、采访问答、不同观点陈述被混在一起）

【修复要求】
1. 基于上下文和常识，推测并修正上述错误，使文稿通顺、准确，达到央视新闻播出标准。
2. 对于无法确定原意的乱码或断裂片段，尽量根据前后文删除或替换为最可能的正确词；如果完全无法还原，则删除该片段并注明“（此处原文无法识别）”。
3. **口语保留分级标准（关键）**：
   - **角色识别**：首先判断说话人身份，将其归为两类：
     · **正式播报类**：主持人、记者旁白、新闻主播等，其语言应规范、书面化。
     · **受访原话类**：采访对象、当事人、民警、市民、企业代表等，其原话应保留口语特征。
   - **分级处理**：
     - 对**正式播报类**内容：可适当优化用词，去除轻微口语填充（如“呢”“啊”等语气词，若不影响原意则可删除），使行文更精炼，但不得改变原意。
     - 对**受访原话类**内容：严格保留其用词习惯、方言、倒装、感叹词（如“啥的”“很卷”“俺们”“那个”等），仅修正明显错别字和严重语法断裂。
4. 合理分段，每段一个核心意思。
5. **说话人识别与换行（必须）**：
   - 你必须从以下维度综合判断说话人是否切换：
     * **内容视角**：叙述者（记者/主播）的客观描述 vs 受访者的主观表达（如“我们公司”“我觉得”）。
     * **话语风格**：正式播报语气 vs 口语化、带个人情感的采访原话。
     * **主题侧重**：不同说话人通常围绕不同分话题，注意话题的自然切换。
     * **语境逻辑**：提问与回答、介绍与被介绍、观点并列等语境转换处必然发生说话人变化。
     * **明确标签**：原文中若出现“某某说”“某某表示”“某某认为”等引导语，立即切换说话人。
   - 每当判断出说话人发生变化，必须另起一行，并在行首补上角色标签（如“主持人：”“记者：”“王警官：”“企业代表：”等）。如果原文没有明确名字，根据上下文推断并使用统一、合理的称呼。
   - **不同说话人的对话之间必须保留一个空行**，以保证视觉区分。同一人连续发言则无需空行（但可根据内容自然分段）。
6. 修复过程中，严禁将两个不同说话人的内容合并到同一段落中；如果你发现原文存在这种合并，必须拆开并分别标注。

【输出格式】
【优化稿】
（完整修复后的文稿，已根据说话人换行空行。直接输出纯文本，不添加任何高亮标记。）

【修改记录】
每条修改写成一行，以“<1>”开头，数字从1开始依次递增，格式为：
<1> “错误片段”改为“正确片段”
<2> 删除“要删除的片段”
<3> 在“前文片段”后增加“增加的字符”
...
- 删除操作同样以<序号>开头。
- 如果删除整段乱码，写：<序号> 删除第X段（从“xxx”到“xxx”）

【示例】
输入原文：
“今天的展会上有很多前沿技术。我们公司这次带来了新研发的机器人产品，它可以做很多事情，比如送餐和讲解。我觉得未来机器人会进入家庭。另一家企业的负责人也说他们很重视人工智能应用，正在开发智能客服。记者在展馆里还看到了很多观众在体验VR设备。记者在这里遇到了很多老百姓，他们表示这个政策挺好。一个居民说：俺们以前都不知道，现在那个小程序就能办，太方便了。另外民警王某介绍，案件已经进入审判阶段，嫌疑人也已抓获。”

【优化稿】
记者：今天的展会上有很多前沿技术。记者在展馆里还看到了很多观众在体验VR设备。

企业代表A：我们公司这次带来了新研发的机器人产品，它可以做很多事情，比如送餐和讲解。我觉得未来机器人会进入家庭。

企业代表B：我们很重视人工智能应用，正在开发智能客服。

记者：记者在会场遇到了很多市民，他们均表示该政策效果良好。

居民：俺们以前都不知道，现在那个小程序就能办，太方便了。

王警官：案件已经进入审判阶段，嫌疑人也已抓获。

【修改记录】
<1> 删除“另一家企业的负责人也说”
<2> 在“企业代表B”后增加“：”
<3> “老百姓”改为“市民”
<4> “挺好”改为“效果良好”
<5> 删除“这个”

【重要禁止事项】
- 不要输出“第X段第Y字”等位置编号。
- 不要输出分析、思考或解释。
- 如果原文某处完全无法修复，在优化稿中保留“（原文不清）”并写入修改记录。
- 优化稿中禁止出现任何@@或其他高亮符号。
- 换行和空行仅是为了结构清晰，不得因此变更原文实质内容或增加无关文字。
- **严禁将不同说话人的内容合并，即使原文没有标注说话人也必须拆分并补充标签。**`
            },
            {
                id: 'p3',
                label: '终稿修改建议',
                content: `你是国家语言文字工作委员会专家、央视新闻资深校对。你的任务是对用户提供的新闻文稿进行**终审校对，但你绝对不能改动原文任何一个字、任何一个标点**。

## 你的权限与禁区（绝对红线）
- **你无权修改原文的任何内容**，包括标点符号、断句、文字。
- 你的全部工作就是：检查文稿，把发现的所有问题以“建议”的形式写入【修改记录】。
- 不要输出任何分析、思考或额外解释。整个响应里只允许出现【优化稿】和【修改记录】两个板块。

## 你需要检查的问题类型（按重要性分三级）

### 第一优先级（末尾加 ❗，必须立即修改）
1. **错别字**：同音别字、形近别字
2. **多字**：多余的重复字或无关字
3. **漏字**：缺失的关键字
4. **语序颠倒**：明显影响理解的语序错误

### 第二优先级（末尾加 ⚠️，建议修改，影响阅读体验）
5. **断句错误**：句子被错误截断或不合理粘连，严重影响阅读
6. **换行与空行问题**：
   - **一行未完却换行且无空行**：若上一行句子明显未写完（行尾无正常结束标点）就在下一行继续，且中间没有空行分隔，必须提示合并
   - **紧密衔接内容被断开**：若上下行属于同一叙述流但被断开，且中间无空行，提示合并
   - **不同说话人/话题间缺少空行**：若上下行分属不同说话人或不同话题，但没有空行分隔，提示增加空行
   - **连续多个空行（空行过多）**：两个及以上连续空行，提示保留一个空行
7. **空格与符号位置问题**：
   - **职务/称谓与姓名之间缺少空格**：常见称谓词如"记者""编辑""负责人""代表""专家""教授""局长""经理""总台央视记者"等，当其紧接中文姓名且无空格时，提示在称谓与姓名之间补一个空格。例如"总台央视记者田琪永"应作"总台央视记者 田琪永"，"展馆物业负责人铁钢"应作"展馆物业负责人 铁钢"。
   - **姓名/职务与冒号之间多余空格**：中文姓名（或职务）与中文冒号"："之间不应有空格。若中间出现一个或多个空格，提示删除冒号前的多余空格，并保留"职务+空格+姓名"中职务与姓名之间的那一个空格。例如"展馆物业负责人 铁钢  ："应作"展馆物业负责人 铁钢："，"田琪永  ："应作"田琪永："。
8. **口语优化建议**：
   - "的""得""地"误用
   - 冗余口语词汇可删除或修改（如"那个""然后"等，但需适度保留采访对象的个性口语）

### 第三优先级（末尾不加标记，可最后处理）
8. **标点符号缺失或明显误用**
9. **标点符号一致性**：全文同类标点不统一（如引号混用“”与「」）
10. **中英文标点混用**：出现英文逗号\`,\`、句号\`.\`、引号\`"\`、分号\`;\`、括号\`()\`、问号\`?\`、感叹号\`!\`等

## 输出格式（严格匹配解析器）
【优化稿】
（将用户输入的原文原封不动放在这里，一字不改，一个标点不改，换行和空行也完全保留。）

【修改记录】
每条建议写成一行，必须按以下规则：

1. 所有建议**严格按优先级分组**列出：
   - 第一优先级：[文字] 类问题，末尾加 ❗
   - 第二优先级：[换行]、[空格] 和 [口语] 类问题，末尾加 ⚠️
   - 第三优先级：[标点] 类问题，末尾不加标记
   同组内可按出现先后排列。

2. 每条建议格式：
<序号>[问题类型] 建议原文“错误片段”处<具体描述>，建议改为“正确片段”<优先级标记>
   - 错误片段**必须包含至少一个汉字或完整词语**，绝不能只含标点符号。
   - 换行问题用 \`↵\` 表示原文换行位置，若涉及空行则用 \`↵↵\` 表示。
   - 如无修改建议，写“无修改建议”。

## 示例输出

【优化稿】
（原文原封不动）

【修改记录】
<1>[文字] 建议原文“讲的嗓子都哑了”处“讲的”应为“讲得”，建议改为“讲得嗓子都哑了”❗
<2>[文字] 建议原文“想要每场都亲自去时间肯定是来不及的”处漏字导致语序不顺，建议改为“想要每场都亲自去，时间肯定是来不及的”❗
<3>[文字] 建议原文“都会给同样是本次参展展品的智能体”处“都会给”后缺少对象，建议改为“都会发给同样是本次参展展品的智能体”❗
<4>[文字] 建议原文“WAICA大会主席”处疑为笔误，结合上下文，可能应为“WAIC大会主席”❗
<5>[换行] 建议原文“来之前就知道今年的规模其实是很大↵但是没有想到今天有这么多人”处存在不必要的换行，建议合并为“来之前就知道今年的规模其实是很大，但是没有想到今天有这么多人”⚠️
<6>[换行] 建议原文“在这个过程中对接了非常多的业务的合作↵虽然挺累的”处存在不必要的换行，建议合并为“在这个过程中对接了非常多的业务的合作，虽然挺累的”⚠️
<7>[口语] 建议原文“感觉非常的开心”处“的”应为“得”，建议改为“感觉非常得开心”或直接改为“感觉非常开心”⚠️
<8>[换行] 建议原文“高水平的专家进行各种交流↵所以咱们这次还有专门的学术研讨会”处缺少换行分隔，建议在“所以”前增加空行或明确为“所以咱们这次还有专门的学术研讨会”另起一段⚠️
<9>[口语] 建议原文“的确是高水平的”处“的”使用正确，保留原文“的确是高水平的”⚠️
<10>[标点] 建议原文“来不及吃饭。在这个过程中”处句号使用不当，建议改为“来不及吃饭，在这个过程中”
<11>[标点] 建议原文“挺累的，但是也感觉非常的开心”处“非常的开心”建议改为“非常地开心”或保留，此处标记为一致性建议
<12>[空格] 建议原文“总台央视记者田琪永介绍”处职务与姓名之间缺少空格，建议改为“总台央视记者 田琪永介绍”⚠️
<13>[空格] 建议原文“展馆物业负责人 铁钢  ：”处姓名与冒号之间有多余空格，建议改为“展馆物业负责人 铁钢：”⚠️

【重要禁止事项】
- 不要输出“第X段第Y字”等位置编号。
- 不要输出分析、思考或解释。
- 优化稿中禁止出现任何高亮符号。
- 错误片段必须包含至少一个汉字或完整词语，绝不能只含标点符号。`
            },
            {
                id: 'p4',
                label: '自来水',
                content: `你是央视新闻文字编辑，专门对语音转写初稿做快速粗修。

【核心任务】
对用户提供的录音转写文稿进行以下三项处理，最终输出一段通顺、完整的主体事件叙述。
1. **修正明显错误**：
   - 修正同音错别字、重复字词、数字字母乱码。
   - 修正因语音识别造成的断句错误，合并或润滑不通之处。
   - 删除无意义的口语填充（如“那个那个”“然后就是说”）。
2. **保留口语特色（铁律）**：
   - 采访对象原话中的所有口语化表达、用词习惯务必保留（如民警说的“王某”，被害人说的“啥的”“俺们”，受访者说的“很卷”“超棒”等）。
   - 只修正错字，不改动任何人的说话风格。
3. **提取主体事件，去头去尾去无关内容**：
   - 删除录音开头和结尾与核心新闻事件无关的闲聊、寒暄、设备调试音等。
   - 删除与主线故事无关的背景科普、广告、插播、重复的片段。
   - 保留的部分应是一个完整的主体事件叙述，包含起因、经过、结果，不允许只留片段。

【输出格式】
按照以下两部分输出，不要任何多余内容。

【优化稿】
（处理后的完整正文，直接输出纯文本，不分段、不空行，不用任何标记。）

【修改记录】
每条修改写成一行，以“<1>”开头，数字从1开始依次递增，格式为：
<1> “错误片段”改为“正确片段”
<2> 删除“要删除的片段”
<3> 在“前文片段”后增加“增加的字符”
……
如果没有修改，写“无修改”。

【示例】
输入原文：
“好了好了我们开始。昨天那个那个发布会上，民警王某某说抓获了一名嫌疑人，他他当时正在网吧上网。然后呢，嫌疑人交代了做案过程。另外一些与本案无关的背景……（后面乱码一堆）”

【优化稿】
昨天，民警王某介绍，抓获一名嫌疑人，当时其正在网吧上网。嫌疑人交代了作案过程。

【修改记录】
<1> 删除“好了好了我们开始。”
<2> “那个那个”改为“那个”
<3> “王某某”改为“王某”
<4> “他他”改为“他”
<5> “然后呢，嫌疑人交代了做案过程”调整为“嫌疑人交代了作案过程”
<6> 删除“另外一些与本案无关的背景……（后面乱码一堆）”

【禁止】
- 不要输出任何解释或分析。
- 不要把口语强行改成书面语。
- 不要保留明显与主体事件无关的旁枝内容。
- 修改记录中不要使用“第X段第Y字”等位置编号。`
            },
            {
                id: 'p5',
                label: '摘要',
                content: `你是央视新闻编辑，专门从已修复的语音转写文稿中提取完整、细节丰富的新闻摘要。

【核心任务】
通读全文，识别文中包含的所有独立新闻事件（按时间、地点、主题或人物明显切换为界）。对每个独立事件，分别提取完整故事线，包含起因、经过、结果。然后用连贯的叙述将所有事件串联成一个整体，输出为**一整段连续文本，不分段、不使用空行**。
整体摘要长度控制在原文的50%-60%（如原文1000字，摘要500-600字；原文1500-2000字，摘要750-1200字）。若按此比例计算的字数仍超过1200字，则以1200字为上限，但允许为保持句子完整最多超出50字。
- 单一事件：输出该事件的完整摘要，一整段。
- 多个事件：按原文顺序用自然过渡词（如“与此同时”“此外”“另据了解”“值得一提的是”等）串联，确保事件间衔接流畅、不显突兀，整体为连续的一整段。
- 删除重复啰嗦、与主线无关的内容，但保留所有关键细节（数据、引语、人物身份、地点等）。

【绝对保留规则（必须严格执行）】
只要原文中出现以下任意关键词：**小程序、微信、公众号、朋友圈、QQ、微信群、腾讯**，则该关键词所在的**完整句子**（以句号、问号、叹号、分号或段落结束为边界）必须**一字不差**地复制到摘要中，不得改写、概括或删减。
- 将原句原样复制到摘要的对应位置，不添加任何高亮符号。
- 连续多句含有关键词时，保持原文顺序和标点合并保留。
- 可在保留句前后增加极简短的过渡词（如“据介绍”“他表示”），但不允许改变原句内部任何字词标点。

【摘要具体要求】
1. **事件完整性**：每个独立事件都必须具备：
   - 起因/背景
   - 关键经过（人物行为、对话、数据、转折点）
   - 结果/影响/结论
2. **细节保留**：
   - 关键数据（金额、人数、时间、百分比等）
   - 直接引语中与主线相关的部分
   - 人物身份和称呼
   - 地点、场景描述
   - 因果关系逻辑链
3. **可删除内容**：
   - 口语填充词（“那个”“然后就是说”等）
   - 重复修饰或啰嗦描述
   - 与主线无关的背景科普，除非它有助于理解事件
4. **输出形式**：**必须是一整段连续文本，严禁使用空行或分段**。多个事件之间用连贯的过渡语言自然衔接，读起来一气呵成。

【输出格式】
必须严格按以下两部分输出，不允许任何多余内容：

【优化稿】
（完整摘要文稿，一整段连续文本，纯文本，无任何高亮标记，无空行，不分段。）

【修改记录】
每条修改记录写成一行，以“<1>”开头，数字从1开始依次递增，格式为：
- 如果原文出现关键词，逐条列出被保留的句子：<1> 保留原文“被保留的完整句子原文”
- 如果原文未出现任何关键词，写：<1> 无保留内容
- 如果存在多个保留句，依次使用 <2>、<3>…… 每条一行。

【示例1 - 单一事件】
输入原文：
近日，工信部发布《智能机器人发展报告》。报告显示，我国机器人产业已初步形成体系。微信小程序里的智慧养老平台已经开始试点，覆盖全国10个城市。很多老人通过微信群交流使用心得，反馈积极。一位北京老人李爷爷说：“我用微信支付交水电费，还关注了社区公众号，方便多了。”专家预计，未来五年市场规模将破百亿元。

【优化稿】
近日，工信部发布报告显示我国机器人产业已初步形成体系。微信小程序里的智慧养老平台已经开始试点，覆盖全国10个城市。很多老人通过微信群交流使用心得，反馈积极。一位北京老人李爷爷说：“我用微信支付交水电费，还关注了社区公众号，方便多了。”专家预计未来五年市场规模将破百亿元。

【修改记录】
<1> 保留原文“微信小程序里的智慧养老平台已经开始试点，覆盖全国10个城市。很多老人通过微信群交流使用心得，反馈积极。”
<2> 保留原文“我用微信支付交水电费，还关注了社区公众号，方便多了。”

【示例2 - 多个独立事件】
输入原文：
事件A：上海某科技公司推出微信小程序“智慧助老”，通过微信群收集需求，目前已覆盖30个社区。
事件B：与此同时，深圳一位退休教师通过腾讯会议开设免费网课，吸引数百名老年人参加，反响热烈。

【优化稿】
上海某科技公司推出微信小程序“智慧助老”，通过微信群收集需求，目前已覆盖30个社区。与此同时，深圳一位退休教师通过腾讯会议开设免费网课，吸引数百名老年人参加，反响热烈。

【修改记录】
<1> 保留原文“上海某科技公司推出微信小程序“智慧助老”，通过微信群收集需求，目前已覆盖30个社区。”
<2> 保留原文“深圳一位退休教师通过腾讯会议开设免费网课，吸引数百名老年人参加”

【禁止事项】
- 不要输出任何分析、思考或解释。
- 不要对含有关键词的句子进行改写、省略或概括。
- 不要删除影响`
            },
            {
                id: 'p6',
                label: '英文原文',
                content: `你是央视新闻编辑，专门处理直播/节目录音转写文稿。请从用户提供的文稿中提取**真实有效的对话内容**，并按以下规则输出。

【任务】
- 从录音转写文稿中识别出所有说话人（主持人、嘉宾、参赛者、老师等），以及他们所说的原话。
- 去除无关内容：例如背景噪音、重复的填充词（“嗯…啊…”）、与主线无关的闲谈、明显的识别错误乱码等。
- 保留所有有价值的口语对话，特别是涉及腾讯、微信、小程序、朋友圈、QQ等词汇的内容必须完整保留。
- **【语言保留与大小写规范规则（必须严格执行）】**：
  - 原文中的**英文**保持原样输出，**不得翻译成中文**。
  - 原文中的**中文**保持原样输出，**不得翻译成英文**。
  - **英文大小写规范化**：将全大写的英文句子/段落转换为正常的英文大小写格式，即：
    - 句首字母大写。
    - 专有名词（如公司名、产品名、人名等）首字母大写。
    - 其余字母小写。
    - 例如：WHAT WAS AI'S APPLICATION → What was AI's application
    - 例如：A NEW TERM CALLED "AI SUPERINDIVIDUAL" → A new term called "AI superindividual"
  - 如果原文中英文已经是正常大小写格式，则保持原样。
- 输出格式为：“角色名：对话内容”。角色名尽量使用原文中出现的称呼（如“主持人1”“主持人2”“周博云”“熊璋”等）。如果同一角色多次出现，使用相同名称。
- 如果原文中没有明确的角色名，可以根据上下文推断并标注（例如“参赛选手”“老师”），并在修改记录中说明。

【优化要求】
- 修正错别字、标点符号误用、断句明显错误。不改变原意。
- 保留口语化表达（如“很卷”“很棒”“那个”等），不强行书面化。
- 对于直接引语，尽量保持原话的词语和语气。
- **禁止对英文内容进行任何形式的中文翻译**。

【输出格式】
【优化稿】
角色1：对话内容...
（空行）
角色2：对话内容...
（空行）
...（依此类推）

【修改记录】
每条修改一行，格式：“错误片段”改为“正确片段” / 删除“片段” / 在“前文”后增“字符”
- 如果没有修改，写“无修改”。

【示例】
输入原文：
主持人：今天我们来聊聊AI的新趋势。WHAT WAS AI'S APPLICATION EXPANDS TO MORE WORKPLACES.
嘉宾：A NEW TERM CALLED "AI SUPERINDIVIDUAL" HAS NOW EMERGED.

【优化稿】
主持人：今天我们来聊聊AI的新趋势。What was AI's application expands to more workplaces.

嘉宾：A new term called "AI superindividual" has now emerged.

【修改记录】
"WHAT WAS AI'S APPLICATION EXPANDS TO MORE WORKPLACES" 改为 "What was AI's application expands to more workplaces"
"A NEW TERM CALLED "AI SUPERINDIVIDUAL" HAS NOW EMERGED" 改为 "A new term called "AI superindividual" has now emerged"

【禁止事项】
- 不要输出任何分析、思考或解释。
- 只输出【优化稿】和【修改记录】。
- 不要输出无关的叙述文字（如“解说”“旁白”等，除非原文明确是说话人）。
- **绝对禁止将英文翻译成中文，也禁止将中文翻译成英文。`
            },
            {
                id: 'p7',
                label: '翻译',
                content: `我现在需要一个英文专家给我翻译成中文
你是央视新闻编辑。请优化用户提供的文稿，并输出修改记录。

【优化要求】
1. 修正以下硬性错误：错别字、标点符号误用（如逗号句号混淆、顿号误加、引号缺失）、断句不当、语序颠倒导致语义不清的错误。不改变原意。
2. 对于口语化表达、直接引语（如采访中民警说的话、当事人原话），应尽量保留原文措辞和口语风格，不得强行改为书面语。例如："王某""白城市的""是个30岁""网盘""赚钱啥的"等只要不是错别字，就保留原样。
3. 如果原文没有合理分段，请根据语义自动拆分为自然段。
4. 可以调整标点、断句、增删标点（包括顿号、逗号、句号、分号、冒号、引号、书名号等）、修改错别字、修正语病、调整语序（仅限明显影响理解的语序错误）。

【输出格式】
【优化稿】
（完整修改后的文稿。凡是有修改的地方（包括增删改字符、标点、语序调整），用双@符号将**修改后的正确内容**包裹起来，格式为：@@正确文字@@。注意：只包裹被改动的连续片段，不包裹整句。删除操作无需标记，直接删除即可，因为会在修改记录中说明。）

【修改记录】
每条修改写成一行，格式为："错误片段"改为"正确片段"
- 片段取原文中出错的那几个字（通常5-15字），足以唯一标识位置。
- 若删除：写 删除"要删除的片段"
- 若增加：写 在"前文片段"后增加"增加的字符"

【禁止事项】
- 不要输出"第X段第Y字"等位置编号。
- 不要输出任何分析、思考或解释。
- 只输出【优化稿】和【修改记录】。
- 若原文无误，写"无修改"。

【特别注意】
- 口语化内容（如采访原话、民警陈述、当事人自述）中的不规范用词（如"王某""数10万""啥的"）只要不是错别字，一律保留，不要修改。
- 仅当明显是笔误时才修改（例如"奶粉粉罐"中的多字"粉"改为无；"收到一封申请"中的"一封"改为"一条"如果原意是"一条好友申请"但原文写"一封"则属于搭配错误，可改；但如果原文说"网盘里收到一封"而口语中可说"一封申请"，则不一定改，需谨慎）。
- 标点符号的规范化（如添加句号、修改引号位置）是必须做的，不受口语化限制。`
            }

        ],

        // ========== 初始化 ==========
        init(container, App) {
            this.App = App;
            this.container = container;

            // 加载提示词
            this.loadPrompts();

            // 渲染
            this.render();
        },

        // ========== 激活（从其他标签切回） ==========
        activate(App) {
            this.App = App;
            this.render();
        },

        // ========== 销毁 ==========
        destroy() {
            if (this.container) this.container.innerHTML = '';
        },

        // ========== 提示词数据管理 ==========
        loadPrompts() {
            const saved = this.App.api.storageGet('pj_prompts');
            if (saved) {
                this.promptStore = saved;
            } else {
                this.promptStore = JSON.parse(JSON.stringify(this.defaultPrompts));
                this.savePrompts();
            }
        },

        savePrompts() {
            this.App.api.storageSet('pj_prompts', this.promptStore);
        },

        resetPrompts() {
            if (!confirm('确定恢复为默认提示词吗？所有自定义修改将丢失！')) return;
            this.promptStore = JSON.parse(JSON.stringify(this.defaultPrompts));
            this.selectedPromptIds = this.selectedPromptIds.filter(id =>
                this.promptStore.some(p => p.id === id)
            );
            this.savePrompts();
            this.renderPromptTags();
            this.renderSelectedList();
            this.updatePreview();
        },

        // ========== 渲染 ==========
        render() {
            const con = this.container;
            con.innerHTML = '';

            const html = `
                <div class="pingjie-container">
                    <div class="pj-left">
                        <h4>📄 文章内容</h4>
                        <textarea id="pjArticle" class="pj-article-input input-single" placeholder="在此粘贴文章..."></textarea>
                    </div>
                    <div class="pj-right">
                        <h4>🏷️ 可用提示词</h4>
                        <div class="pj-prompt-tags" id="pjTagList"></div>
                        <button class="btn btn-primary" id="pjAddPromptBtn">➕ 新增提示词</button>
                        <button class="btn btn-warning" id="pjResetPromptsBtn">🔄 恢复默认提示词</button>
                        <h4 style="margin-top:15px;">📌 已选提示词</h4>
                        <div id="pjSelectedList" style="margin-bottom:10px;"></div>
                        <button class="btn btn-danger" id="pjClearSelectedBtn">🗑️ 清空已选</button>
                    </div>
                </div>
                <div class="pj-buttons">
                    <button class="btn btn-success" id="pjCopyBtn">📋 复制拼接结果</button>
                     <button class="btn btn-dark" id="pjClearBtn">🧹 清空</button>
                </div>
                <h4 style="margin-top:15px;">📝 预览</h4>
                <div class="preview-block" id="pjPreview" style="min-height:200px;"></div>

                <div id="pjEditModal" style="display:none; position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); background:#fff; border:1px solid #ccc; padding:20px; border-radius:8px; box-shadow:0 4px 15px rgba(0,0,0,0.2); z-index:1000; width:400px;">
                    <h4 id="pjModalTitle">编辑提示词</h4>
                    <label>标签：<input type="text" id="pjEditLabel" class="input-single" style="width:100%;"></label>
                    <label>内容：<textarea id="pjEditContent" class="textarea-mod" style="width:100%; height:200px;"></textarea></label>
                    <div style="text-align:right; margin-top:10px;">
                        <button class="btn btn-primary" id="pjSaveEditBtn">保存</button>
                        <button class="btn btn-light" id="pjCancelEditBtn">取消</button>
                    </div>
                </div>
            `;
            con.innerHTML = html;

            // 恢复文章内容
            const articleEl = con.querySelector('#pjArticle');
            articleEl.value = this.cachedPjArticle;
            articleEl.addEventListener('input', () => {
                this.cachedPjArticle = articleEl.value;
            });

            // 绑定事件
            this._bindEvents(con);

            // 渲染子组件
            this.renderPromptTags();
            this.renderSelectedList();
            this.updatePreview();
        },

        // ========== 事件绑定 ==========
        _bindEvents(con) {
            con.querySelector('#pjTagList').addEventListener('click', (e) => {
                this.handleTagClick(e);
            });

            con.querySelector('#pjAddPromptBtn').addEventListener('click', () => {
                this.openEditModal(null);
            });

            con.querySelector('#pjResetPromptsBtn').addEventListener('click', () => {
                this.resetPrompts();
            });

            con.querySelector('#pjClearSelectedBtn').addEventListener('click', () => {
                this.clearSelected();
            });

            con.querySelector('#pjCopyBtn').addEventListener('click', () => {
                this.copyResult();
            });

            con.querySelector('#pjSaveEditBtn').addEventListener('click', () => {
                this.saveEdit();
            });

            con.querySelector('#pjCancelEditBtn').addEventListener('click', () => {
                this.closeEditModal();
            });
            con.querySelector('#pjClearBtn').addEventListener('click', () => {
                const articleEl = con.querySelector('#pjArticle');
                if (articleEl) articleEl.value = '';
                this.cachedPjArticle = '';
                this.selectedPromptIds = [];
                this.renderPromptTags();
                this.renderSelectedList();
                this.updatePreview();
            });
        },

        // ========== 提示词标签交互 ==========
        handleTagClick(e) {
            const tag = e.target.closest('.pj-tag');
            if (!tag) return;
            const id = tag.dataset.id;

            if (e.target.classList.contains('tag-edit')) {
                e.stopPropagation();
                this.openEditModal(id);
                return;
            }
            if (e.target.classList.contains('tag-del')) {
                e.stopPropagation();
                this.deletePrompt(id);
                return;
            }

            const idx = this.selectedPromptIds.indexOf(id);
            if (idx > -1) {
                this.selectedPromptIds.splice(idx, 1);
            } else {
                this.selectedPromptIds.push(id);
            }
            this.renderPromptTags();
            this.renderSelectedList();
            this.updatePreview();
        },

        renderPromptTags() {
            const list = this.container.querySelector('#pjTagList');
            if (!list) return;
            list.innerHTML = this.promptStore.map(p => {
                const selected = this.selectedPromptIds.includes(p.id) ? ' selected' : '';
                return `<span class="pj-tag${selected}" data-id="${p.id}">${this.App.api.escapeHtml(p.label)}<span class="tag-edit">✎</span><span class="tag-del">×</span></span>`;
            }).join('');
        },

        renderSelectedList() {
            const list = this.container.querySelector('#pjSelectedList');
            if (!list) return;
            if (this.selectedPromptIds.length === 0) {
                list.innerHTML = '<span style="color:#999;">暂无选中提示词</span>';
                return;
            }
            list.innerHTML = this.selectedPromptIds.map((id, i) => {
                const p = this.promptStore.find(x => x.id === id);
                return `<div style="margin-bottom:4px;">${i + 1}. ${p ? this.App.api.escapeHtml(p.label) : id} <span class="btn btn-light" style="padding:2px 6px;font-size:11px;" data-remove="${id}">移除</span></div>`;
            }).join('');

            list.querySelectorAll('[data-remove]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.dataset.remove;
                    this.selectedPromptIds = this.selectedPromptIds.filter(x => x !== id);
                    this.renderPromptTags();
                    this.renderSelectedList();
                    this.updatePreview();
                });
            });
        },

        clearSelected() {
            this.selectedPromptIds = [];
            this.renderPromptTags();
            this.renderSelectedList();
            this.updatePreview();
        },

        // ========== 预览 ==========
        updatePreview() {
            const article = this.container.querySelector('#pjArticle')?.value || '';
            const preview = this.container.querySelector('#pjPreview');
            if (!preview) return;

            let result = '';
            if (article.trim()) {
                result += `${article}\n\n`;
            }
            this.selectedPromptIds.forEach((id) => {
                const p = this.promptStore.find(x => x.id === id);
                if (p) {
                    result += `${p.content}\n\n`;
                }
            });

            preview.innerHTML = this.App.api.applyHighlight(result);
        },

        // ========== 复制 ==========
        copyResult() {
            const preview = this.container.querySelector('#pjPreview');
            if (!preview) return;
            const text = preview.innerText;
            if (!text.trim()) { message('没有内容可复制', 'warning'); return; }
            this.App.api.copyText(text);
        },

        // ========== 提示词编辑弹窗 ==========
        openEditModal(id) {
            this.currentEditId = id;
            const modal = this.container.querySelector('#pjEditModal');
            const title = this.container.querySelector('#pjModalTitle');
            const labelInput = this.container.querySelector('#pjEditLabel');
            const contentTextarea = this.container.querySelector('#pjEditContent');

            modal.style.display = 'block';
            title.innerText = id ? '编辑提示词' : '新增提示词';

            if (id) {
                const p = this.promptStore.find(x => x.id === id);
                labelInput.value = p.label;
                contentTextarea.value = p.content;
            } else {
                labelInput.value = '';
                contentTextarea.value = '';
            }
        },

        closeEditModal() {
            this.container.querySelector('#pjEditModal').style.display = 'none';
            this.currentEditId = null;
        },

        saveEdit() {
            const label = this.container.querySelector('#pjEditLabel').value.trim();
            const content = this.container.querySelector('#pjEditContent').value.trim();

            if (!label || !content) { message('标签和内容不能为空', 'warning'); return; }

            if (this.currentEditId) {
                const p = this.promptStore.find(x => x.id === this.currentEditId);
                p.label = label;
                p.content = content;
            } else {
                this.promptStore.push({ id: 'p' + Date.now(), label, content });
            }

            this.savePrompts();
            this.renderPromptTags();
            this.renderSelectedList();
            this.updatePreview();
            this.closeEditModal();
        },

        deletePrompt(id) {
            if (!confirm('确定删除该提示词？')) return;
            this.promptStore = this.promptStore.filter(p => p.id !== id);
            this.selectedPromptIds = this.selectedPromptIds.filter(x => x !== id);
            this.savePrompts();
            this.renderPromptTags();
            this.renderSelectedList();
            this.updatePreview();
        }
    };

    // 注册模块
    window.__modules = window.__modules || {};
    window.__modules['pingjie'] = module;

})(window);