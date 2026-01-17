# 02 页面与流程设计(精简版)

> **文档定位**: 定义页面结构与交互流程;数据结构见03,技术实现见04
> **版本**: v2.1稳定版 - 核心功能已锁定,仅接受边界条件补充和Bug修复

**维护说明**:
* 与代码实现保持同步,关键数据结构引用`src/lib/supabase/db.ts`
* 与03_API设计文档相互引用,变更时需同步检查
* MVP范围: 不包括配额退款、断点续传、实时多标签页同步、埋点

---

## 0. 术语与约定

| 术语 | 英文 | UI示例 | DB字段 | 说明 |
|-----|------|--------|--------|------|
| 课程 | Course | "New course" | `courses` | - |
| 贴纸 | Sticker | - | `stickers` | AI解释卡片 |
| 自动讲解 | Auto-explain | "Explain this page" | `type='auto'` | 按页生成 |
| 选中讲解 | Manual-explain | "AI讲解" | `type='manual'` | 选中文本生成 |
| 追问链 | Follow-up chain | - | `parent_id` | 贴纸间的父子关系 |
| 配额 | Quota | "87/150 interactions" | `quotas` | AI功能次数限制 |
| 滑动窗口讲解 | Auto-explain session | "Explain From This Page" | - | 连续多页讲解 |

**文案规则**: 动作型用动词(New course),引导型用完整句子(Create your first course)

---

## 1. 页面总览

### 1.1 页面清单

| ID | 页面 | 路径 | 职责 |
|----|------|------|------|
| P1 | 登录 | `/login` | 邮箱密码登录 |
| P2 | 注册 | `/register` | 新用户注册+邮箱验证 |
| P3 | 课程列表 | `/courses` | 课程管理(增删查) |
| P4 | 课程详情 | `/courses/[id]` | 文件列表+配额预览 |
| P5 | PDF学习 | `/courses/[id]/files/[fid]` | PDF阅读+AI功能 |
| P7 | Settings | `/settings` | 语言设置+使用统计(配额详情+成本分析) |
| P9 | 管理员控制台 | `/admin/dashboard` | 系统监控+成本分析 |

### 1.2 全局导航(AppHeader)

**所有已登录页面显示**:
* 左侧: Logo + "StudentAid"(点击→`/courses`)
* 右侧: Courses | Settings | Sign Out

**面包屑规则**:

| 页面 | 面包屑 |
|-----|--------|
| P3 | 无 |
| P4 | Courses / [Course Name] |
| P5 | Courses / [Course Name] / [File Name] |
| P7 | Courses / Settings |

### 1.3 核心数据结构(关键字段)

**Course**:
```
id, name, school, term, file_count
last_visited_at, created_at, updated_at  // 用于排序
```

**File**:
```
id, name, type(Lecture|Homework|Exam|Other), page_count
is_scanned, last_read_page
image_extraction_status, image_extraction_progress
```

**Sticker**:
```
id, type(auto|manual), page, content_markdown
anchor_text, anchor_rect, parent_id, depth(0-10), folded
```

**Quota**(配额限制):
```
bucket: learningInteractions(150/月) | autoExplain(300/月)
        | documentSummary(100/月) | sectionSummary(65/月)
        | courseSummary(15/月)
used, limit, reset_at  // 基于注册日期每月重置
```

---

## 2. P1/P2 认证

### P1 登录

**关键状态**:

| 场景 | HTTP | 前端行为 |
|------|------|---------|
| 成功 | 200 | 跳转`/courses` |
| 邮箱未验证 | 403 + `EMAIL_NOT_CONFIRMED` | 显示"Resend verification email"按钮 |
| 密码错误 | 401 | 提示"Invalid email or password" |
| URL错误参数 | - | `?error=verification_failed`等显示对应提示 |

### P2 注册

**流程**:
1. 提交注册 → 不自动登录,停留当前页
2. 显示: "Check your email...click the link to verify"
3. 用户点邮件链接 → `/auth/callback?code=xxx`
4. exchangeCodeForSession → 设置httpOnly cookie → 跳转`/courses`

**边界情况**:
* 未验证就登录 → 403 + "重发邮件"按钮
* 验证链接过期(24h) → 跳转`/login?error=link_expired`

### 权限矩阵

| 用户状态 | 登录 | P3-P8 | AI功能 | P9管理 |
|---------|-----|-------|--------|--------|
| 未注册 | ❌ | ❌ | ❌ | ❌ |
| 已注册未验证 | ❌(403拦截) | ❌ | ❌ | ❌ |
| 已验证 | ✅ | ✅ | ✅(受配额限制) | ❌ |
| 管理员 | ✅ | ✅ | ✅(**无限配额**) | ✅ |

---

## 3. P3 课程列表

**布局**: 顶部"New course"按钮 + 课程卡片网格

**排序**: 默认按`created_at`倒序

**交互**:
* 新建课程: 未达6课程上限→弹出对话框;已达上限→禁用+tooltip
* 删除课程: 二次确认"This will also delete all uploaded materials"

**状态**:
* 空状态: "You don't have any courses yet" + 引导按钮
* 快速双击"New course" → 禁用按钮直到响应返回

---

## 4. P4 课程详情

### 布局

**信息栏**:
* 左侧: 课程名/学校·学期/文件统计
* 右侧: **配额快速预览**(87/150 interactions,>90%黄色警告,可点击→`/usage`) + "Course Outline"按钮

**主体**: 按类型分组文件列表(Lecture/Homework/Exams/Other)

### 文件上传

**交互**:
* 支持多文件+拖拽,每文件指定类型
* 进度: 单文件显示进度条+百分比,多文件显示"X/Y files uploaded"
* 取消上传: 点击"×" → 中断+删除服务端临时文件

**文件名冲突**: 弹窗提供3选项(自动重命名/替换原文件/取消)

**扫描件警告**: 上传结果显示⚠️+"检测到扫描件,AI功能可能不可用"

**边界**: 上传50%时刷新页面 → 上传中断,后端清理临时文件(MVP不支持断点续传)

---

## 5. P5 PDF学习

### 5.1 三栏布局

```
┌──────────────────────────────────────────────┐
│ 面包屑 + 文件名           [配额: 87/150]     │
├─────────┬──────────────┬───────────────────┤
│ PDF阅读  │  贴纸栏       │  问答区             │
│ 40-50%  │  25-30%      │  25-30%            │
│         │              │                    │
│ 分页/滚动│ 自动讲解(浅色)│ 历史问答            │
│ 缩放/跳转│ 手动讲解(深色)│ 提问输入框          │
│ 图片检测 │ 追问链(10层) │ 文档/章节总结       │
└─────────┴──────────────┴───────────────────┘
```

**比例**: 可拖拽分隔条调整,约束每栏最小20%最大70%,偏好存localStorage

**响应式**: 移动端改为标签页(贴纸tab | 问答tab)

### 5.2 核心功能

#### 自动讲解(Explain this page)

**生成策略**:

| PDF风格 | 处理 | 贴纸数 | 贴纸尺寸 |
|---------|------|--------|----------|
| PPT风格 | 整页综合讲解,识别核心要点 | **1条/页** | 全页覆盖(anchor.rect={x:0,y:0,w:1,h:1}) |
| 长文本(16:9等) | 按段落+语义分块(200-300字) | 2-6条/页 | 对应段落区域,支持hover溯源 |

**缓存行为(v2.0 异步+跨用户共享)**:
* 查询: 用户私有缓存 → 跨用户共享缓存
* 命中: 直接返回(<500ms),不扣配额
* 未命中: 启动异步生成,立即预扣配额

**异步UI状态**:
* 生成中: "AI is generating stickers..." + 每2秒轮询
* 完成: 显示贴纸+更新配额
* 失败: "配额已自动退还" + [重试]

**边界**:
* 快速双击 → 禁用按钮
* 已有贴纸页再次点击 → 返回现有,不重新生成
* 生成中刷新页面 → 恢复轮询(基于localStorage中generationId)

#### 选中文本讲解(Manual)

**从PDF选中**:
1. 拖选文本 → 浮层"AI讲解"按钮
2. 点击 → 插入手动贴纸(顶部标签"From selection"+原文+解释)

**从贴纸追问**:
1. 在贴纸正文选中文本 → 浮层"AI讲解"
2. 生成新贴纸,紧挨上一条(`parent_id`指向父贴纸)
3. UI显示缩进/连接线
4. **深度限制**: 最大10层,达上限禁用+提示

**排序**: 自动贴纸按页顺序;手动贴纸从PDF选中→插入对应页位置,从贴纸追问→紧挨父贴纸

#### 问答(Q&A)

**流程**:
1. 输入 → 调用`POST /api/ai/qa`
2. 回答显示为气泡(Markdown + "References: p.3, p.10")
3. 点击页码 → 左侧滚动到对应页

**与贴纸区别**: 用于跨页/综合性问题,不自动变贴纸

#### 文档/章节总结

**入口**: 问答区工具栏"Summarize this document/section"

**展示**: Summary Card在问答区,可折叠

**边界**:
* 生成中再次点击 → 返回409 + `SUMMARY_IN_PROGRESS`
* 已有总结再次点击 → 返回现有,不扣配额

#### PDF阅读模式

| 模式 | 行为 |
|-----|------|
| Page(分页) | 逐页翻阅,Prev/Next按钮 |
| Scroll(连续) | 多页垂直排列,自然滚动 |

**当前页跟踪**: Page模式显示单页;Scroll模式视口最大可见面积页

**集成**: 模式切换保存localStorage,URL支持`?mode=scroll`参数,贴纸交互/AI功能两种模式通用

#### 图片点击解释

**自动检测**:
* PDF上传时自动提取图片位置(≤50页全提取,>50页前50页+延迟提取剩余)
* 悬停PDF页面 → 显示已识别图片高亮边框+序号徽章
* 点击已识别图片 → 触发AI解释生成贴纸

**手动标记模式**:
* 工具栏"Mark Image"按钮 → 光标变十字
* 点击位置 → 系统尝试检测图片
  - 成功 → 添加到已识别列表
  - 失败 → 弹窗"No image detected" + "Draw manually"按钮
* 选择"Draw manually" → 进入矩形绘制模式

**矩形绘制模式**:
1. 拖拽鼠标绘制矩形选区
2. 区域显示彩色边框+半透明填充+删除按钮(×)
3. 支持跨页选择(关联到根页面)
4. **立即生成**: 每次添加/删除区域 → 立即调用explain-page API

**缓存**: 跨用户共享(基于selection_hash),缓存命中仍消耗配额(用户主动操作)

#### 滑动窗口自动讲解

**行为**:
* 点击"Explain From This Page" → 生成当前页+周围页(前2页+当前+后5页)
* 生成优先级: 当前页 → +1 → -1 → +2 → +3 → -2 → +4 → +5（优先生成用户最可能阅读的页面）
* 进度显示: "Explaining... (X/Y pages)"
* 窗口扩展: 在未覆盖页停留**0.5秒** → 自动触发新窗口生成

**版本管理**:
* 点击"Regenerate" → 生成新版本
* 新旧版本共存,贴纸栏显示版本切换器

**会话管理**:
* 每文档最多1活跃会话
* 已有会话时按钮显示"Cancel"终止
* 终止后已生成贴纸保留

#### 共享上下文库提取

**触发**: 首次打开PDF时后台自动开始,对阅读无干扰

**进度**: P4文件列表显示状态(使用Supabase Realtime实时同步)
* "Extracting context..." + 进度百分比
* "Context ready" ✓
* "Context extraction failed" ⚠️ + 重试按钮

**完成通知**: Toast "Context extraction completed for [filename]"

**配额**: 20个PDF提取/用户/月,超出显示"Context extraction quota exceeded. AI will work with page-level context only"

#### 扫描件处理

* 右侧贴纸栏提示: "This PDF seems to be a scanned document. AI explanations are not available"
* 隐藏"Explain this page"按钮
* 禁用选中文本讲解

---

## 6. P7 Settings（统一入口）

**标签页**: Language | Usage

### Language标签

* UI语言: English | 中文(影响界面显示)
* AI解释语言: English | 中文(影响AI生成内容)
* 首次登录: 显示语言选择模态框
* 切换行为: 触发页面刷新,偏好存`user_preferences`表

### Usage标签

**布局**(响应式网格: Desktop 3列 | Tablet 2列 | Mobile 1列):

**左侧主栏(2/3宽)**:
1. 估算月度成本卡片
   - 当期成本 + 预估月度 + 警告级别(🟢<$10 | 🟡$10-20 | 🔴≥$20)
   - 进度: X天已过, Y天剩余
2. Token使用图表(饼图/柱状图: 输入/输出Token分布)
3. 成本分解表(按操作类型: 调用次数/Token数/成本)

**右侧栏(1/3宽)**:
1. 配额重置信息(下次重置日期+剩余天数)
2. 配额使用概览:
   - 全局配额: "4 / 6 courses" + 进度条
   - AI配额(账户全局):
     - Learning interactions: 87/150
     - Auto-explain: 145/300
     - Document summaries: 23/100
     - Section summaries: 15/65
     - Context extraction: 5/20
   - 进度条颜色: 绿<70%, 黄70-90%, 红>90%
   - 重置日期: "Resets on: Every 7th at 00:00 UTC(根据注册日期)"

**交互**:
* 加载状态: 居中加载指示器
* 错误状态: "Failed to load usage data" + "Try Again"
* 空状态(新用户): 显示0使用量 + "Start using AI features..."

---

## 8. P9 管理后台

### 认证

**流程**:
1. 访问`/admin` → 输入`ADMIN_SECRET`
2. 验证成功 → 存sessionStorage → 跳转`/admin/dashboard`
3. 每次API请求携带`x-admin-secret`请求头

### 页面结构

**顶部栏**: 标题 + 时间范围选择(7天/30天/90天) + Logout

**告警区域**(条件性显示):
* 🔴 Worker异常: "Worker hasn't run in 10+ minutes"
* 🟡 高错误率: "Error rate >5% in the last hour"
* 🟡 成本警告: "Daily cost exceeds $50"
* 🔴 僵尸任务: "X stuck jobs detected"

**概览卡片**(3行网格):
* Row 1: 总用户数/课程数/文件数/贴纸数/问答数/总结数
* Row 2: 总成本/输入Token/输出Token/PDF总页数/平均页数/Context条目数
* Row 3: 上传文件数/问答数/扫描PDF数/错误总数

**图表区**(2列): 活跃用户趋势图 | 操作分布饼图 | 错误分布柱状图 | Token使用统计

**Worker & 缓存区**(2列):
* Worker健康状态(状态/最后运行时间/待处理任务/僵尸任务/平均时长)
* 缓存效率报告(规范文档数/共享贴纸数/成本节省/Top共享文档)

**操作表格**: 操作类型 | 次数 | 独立用户数

---

## 9. 典型流程

### F1 创建课程并上传资料(首次)

1. `/login` → `/register`注册 → 提示"查看邮箱"
2. 点邮件链接 → `/auth/callback` → 设cookie → `/courses`
3. "New course" → 输入信息 → 创建
4. P4 → "Upload PDF" → 选择文件+类型 → 上传
5. 点PDF卡片 → P5阅读学习

### F2 考前冲刺复习

1. 登录 → P3 → P4
2. 确认已上传主要Lecture/Homework/Exam
3. 打开PDF → P5生成文档/章节总结
4. 利用贴纸功能对重点内容追问深入理解
5. 使用Q&A功能跨文档提问综合复习

### F3 跟课场景(整学期)

1. P3 → P4选择讲义 → P5(左侧跳转lastReadPage)
2. "Explain this page" → 生成自动贴纸
3. 选中难点文本 → "AI讲解" → 手动贴纸
4. 对贴纸某句有疑问 → 选中贴纸文本 → 追问链
5. 贴纸增多 → 折叠已理解,展开关注
6. 需整体理解 → "Summarize this section"
7. 第二天重开 → 回到lastReadPage,恢复所有贴纸及折叠状态

---

## 10. 错误恢复

### 注册与验证

* 重复注册: 未验证→"重发邮件"按钮;已验证→"前往登录"
* 验证链接过期: 跳转`/login?error=link_expired`+输入邮箱对话框
* 重发限流: "请求过于频繁,X分钟后重试"+倒计时

### 文件上传

* 文件名冲突: 弹窗提供3选项(重命名/替换/取消)
* 多文件部分失败: 显示每文件状态(✓/❌)+错误原因+[重试]

### AI请求

**配额用尽**:
* 按钮置灰+hover显示"配额已用尽(150/150)"
* 提供[View quota details]链接→P7

**自动讲解限流**:
* "Explain this page"置灰
* 显示倒计时"今日已用完(300/300),X小时后重置"
* 提示"您仍可使用选中文本讲解"

**异步生成错误(v2.0)**:
* 生成失败: "配额已自动退还" + [重试]
* 轮询超时(5分钟): "生成超时,请稍后重试",配额已退还
* 生成中刷新: 自动恢复轮询状态

**请求超时**:
* 15s无响应: "AI正在处理..." + [取消]
* 30s超时: "请求超时,请稍后重试" + [重试],不扣配额

**服务不可用**:
* OpenAI不可用: "AI服务暂时不可用",不扣配额
* Supabase不可用: "服务暂时不可用"

### 会话过期

* 检测401 → 清理本地状态 → 跳转`/login?error=session_expired`
* 深链接访问: 保存原URL到sessionStorage,登录后自动跳转回

### 边界情况汇总

* 重复请求: 快速双击AI按钮→禁用直到响应;已有贴纸页再次点击→返回现有
* 网络中断: AI streaming中断→已返首token则扣配额;贴纸折叠失败→乐观更新+重试3次
* 状态不一致: 配额不符→API返回403时更新本地;多标签页→以数据库状态为准

---

## 附录A: UI交互细节规格

> 本节包含设计实现规格,不影响功能理解,仅供前端开发参考

### A.1 图片提取进度Toast

**位置**: 右下角(z-index: 50)

**状态**:

| 状态 | 图标 | 进度条颜色 | 文案 |
|-----|------|----------|------|
| 进行中 | 蓝色spinner | 蓝色 | "正在检测图片..." |
| 完成 | 绿色勾 | 绿色 | "图片检测完成" |
| 部分失败 | 黄色警告 | 黄色 | "图片检测部分完成" |

**进度**: 进度条0-100%宽度动画 + 百分比 + 页数统计"X/Y页"

**生命周期**: 提取开始→Toast出现→进度更新→完成后显示2秒→淡出

**动画**: 入场300ms(`opacity-0 translate-y-2` → `opacity-100 translate-y-0`)

**参考**: `src/features/reader/components/image-extraction-toast.tsx`

### A.2 自动讲解Session进度Toast

**位置**: 右下角(z-index: 50)

**状态**:

| 状态 | 图标 | 操作按钮 |
|-----|------|---------|
| 生成中 | 蓝色spinner | Cancel(×) |
| 完成 | 绿色勾 | 无 |
| 已取消 | 灰色叉 | 无 |

**进度**: 页面范围"Pages X-Y" + 完成统计"X/Y completed" + 详细状态(X in progress蓝色 | X failed红色)

**交互**: Cancel按钮→终止会话→已生成贴纸保留→显示"Canceled"2秒→淡出

**参考**: `src/features/reader/components/session-progress-toast.tsx`

### A.3 图片检测悬停效果

**触发**: 鼠标悬停PDF页面→显示已识别图片高亮边框

**视觉**:

| 状态 | 边框 | 填充 | 额外元素 |
|-----|------|------|---------|
| 悬停 | 2px蓝色实线 | 蓝色半透明10% | 右下角图片序号徽章 |
| 反馈模式 | 2px蓝色虚线 | 蓝色半透明15% | 无 |

**图片序号徽章**: 右下角,蓝色背景,白色文字,圆角,内容如"1","2","3"

**反馈模式**: 用户首次进入标记模式→所有已检测图片显示虚线边框2-3秒(帮助用户了解已检测区域)

**延迟提取加载**: 大型PDF查看未提取页→页面顶部居中显示半透明背景+spinner+"Detecting images..."

**"未检测到图片"弹窗**:
* 触发: 标记模式下点击位置未检测到图片
* 内容: 黄色警告图标 + "No image detected" + "Draw manually"按钮
* 定位: 点击位置下方20px居中,边界约束到容器内(padding 16px),下方空间不足→显示上方
* 尺寸: 220px宽×80px高
* 交互: ESC键/点击外部(100ms防抖)→关闭;点击"Draw manually"→进入手动绘制

**工具栏状态指示器**(仅部分提取时显示):

| 状态 | 图标 | 文案 | 颜色 |
|-----|------|------|------|
| 部分提取中 | spinner | "Images: X/Y pages" | 灰色 |
| 提取失败 | 警告三角 | "Image detection failed" | 红色 |
| 完成/待开始 | 无显示 | - | - |

**参考**: `src/features/reader/components/image-detection-overlay.tsx`

### A.4 贴纸版本切换UI

**适用范围**: 仅自动贴纸(type="auto")支持

**版本控制区**(位于贴纸卡片底部):
```
[◀] 1/2 [▶]      Select text to ask...
```

**左侧版本导航器**:
* 上一版本(◀): currentVersion > 1时启用,悬停蓝色
* 版本指示器: "X/Y"格式,无版本时"1/1",最小宽度40px居中
* 下一版本(▶): currentVersion < totalVersions时启用

**右侧追问提示**: "Select text to ask a follow-up"(小字灰色斜体)

**加载状态**: 切换期间(`isSwitching=true`)禁用所有导航按钮,无加载指示器(静默切换)

**内容更新**: 成功后版本号立即更新,内容平滑替换,保持展开/折叠状态

**刷新按钮**(贴纸头部):
* 图标: 循环箭头
* 空闲: 灰色,悬停变蓝
* 刷新中: 旋转动画(`animate-spin`),灰色,禁用
* 功能: 生成新版本→totalVersions+1→currentVersion更新为最新

**版本持久化**: 切换立即保存到数据库,用户下次打开恢复上次版本

**手动贴纸差异**: 无版本控制区,无刷新按钮,仅显示追问提示

**参考**: `src/features/stickers/components/sticker-card-versioned.tsx`

### A.5 Hover溯源交互（文本密集型PDF）

**适用范围**: 仅文本密集型PDF的自动贴纸,PPT风格（全页贴纸）不适用

**双向联动**:

| 触发动作 | 响应效果 |
|---------|---------|
| hover贴纸卡片 | PDF高亮对应段落区域(2px蓝色边框+10%蓝色半透明填充) |
| hover PDF段落 | 对应贴纸卡片边框加粗(2px蓝色)+背景变淡蓝色 |

**视觉规格**:
* PDF高亮: `border: 2px solid #3B82F6` + `background: rgba(59,130,246,0.1)`
* 贴纸高亮: `border: 2px solid #3B82F6` + `background: rgba(59,130,246,0.05)`
* 过渡动画: 150ms ease-in-out

**段落检测**:
* 基于anchor.rect坐标判断鼠标位置(使用`usePdfStickerHitTest` hook)
* 鼠标移动节流: 50ms，使用RAF优化性能
* 支持多贴纸覆盖同一区域时全部高亮

**PPT风格贴纸标识**:
* 全页贴纸(`anchor.isFullPage=true`)显示绿色"Full Page"徽章
* 徽章位于Auto/Manual标签旁,包含页面图标

**参考**: `src/features/reader/components/pdf-viewer.tsx`, `src/features/stickers/components/sticker-panel.tsx`, `src/features/reader/hooks/use-pdf-sticker-hit-test.ts`

### A.6 区域选择模式流程

**入口**: 工具栏"Mark Image"→光标变十字→首次显示反馈高亮2-3秒

**退出**: "Exit"按钮 | 切换页面 | 关闭PDF查看器

**绘制流程**:
1. mousedown → 记录起始坐标(x1, y1)
2. mousemove → 实时计算矩形(x=min(x1,x2), width=|x2-x1|) → 显示2px蓝色边框+半透明预览
3. mouseup → 固定矩形 → 添加删除按钮(×) → 归一化坐标(0-1比例)

**多区域管理**:
* 添加: 每区域独立绘制,支持跨页(关联到根页面)
* 删除: 点击×→从列表移除→触发重新生成

**立即生成**:
* 每次添加/删除区域→立即调用explain-page API
* 请求内容: `root_page`, `effective_mode: "mark"`, `marked_regions`(所有已选区域)

**视觉反馈**:
* 悬停贴纸→PDF高亮所有绑定区域(2px蓝色边框+半透明填充)
* 悬停PDF区域→对应贴纸卡片边框加粗/背景变色
* 区域右下角显示序号徽章(蓝底白字)

**缓存**: `selection_hash` = hash(root_page + effective_mode + locale + sorted_regions),即使命中仍消耗配额

**边界**:
* 扫描件PDF: 禁用"Mark Image",提示"不支持区域选择"
* 空区域: 绘制面积<10×10像素→自动丢弃
* 重叠区域: 允许,AI综合生成解释

**参考**: `src/features/reader/hooks/use-rectangle-drawing.ts`, `src/features/reader/components/pdf-viewer.tsx`
