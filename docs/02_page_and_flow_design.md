# 02 页面与流程设计（精简版）

> **文档定位**：定义用户视角的页面结构与交互流程；数据结构见03，技术实现见04。

---

## 1. 页面总览

| 页面ID | 页面名称 | 路径 | 说明 |
|--------|---------|------|------|
| P1 | 登录页 | `/login` | 邮箱+密码登录，引导注册 |
| P2 | 注册页 | `/register` | 新用户注册，邮箱验证流程 |
| P3 | 课程列表 | `/courses` | 课程卡片，新建/编辑/删除 |
| P4 | 课程详情 | `/courses/[courseId]` | 按类型分组显示PDF |
| P5 | PDF阅读与AI学习 | `/courses/[courseId]/files/[fileId]` | 左侧PDF + 右侧AI面板 |
| P6 | 课程级提纲 | `/courses/[courseId]/outline` | 整门课程复习提纲 |
| P7 | 配额与使用 | `/account/usage` | 课程数量与AI配额查看 |

---

## 2. P1 登录页（`/login`）

### 2.1 布局

* **左侧**：品牌/产品介绍（可选）
* **右侧**：
  * 邮箱/密码输入框
  * "Sign in"按钮
  * "Don't have an account? Sign up"链接

### 2.2 状态处理

| 场景 | HTTP状态 | 前端行为 |
|------|---------|---------|
| 登录成功 | 200 | 跳转`/courses` |
| 邮箱未验证 | 403 + `EMAIL_NOT_CONFIRMED` | 显示警告 + "Resend verification email"按钮 |
| 密码错误 | 401 + `INVALID_CREDENTIALS` | 提示"Invalid email or password" |
| 网络错误 | - | "Something went wrong. Please try again later." |

### 2.3 URL参数错误提示

| 参数 | 提示文案 |
|------|---------|
| `?error=verification_failed` | "Email verification failed or link expired. Please try again." |
| `?error=session_expired` | "Your session has expired. Please sign in again." |
| `?error=link_expired` | "The verification link has expired. Please request a new one." |

---

## 3. P2 注册页（`/register`）

### 3.1 表单字段

* **邮箱**：必填，格式校验
* **密码**：必填，≥8字符（MVP无复杂规则）

### 3.2 提交流程

1. 用户点击"Create account"
2. **注册成功**（`needsEmailConfirmation: true`）：
   * **不自动登录**，停留在当前页
   * 显示提示：
     * 标题："Check your email"
     * 内容："We've sent a confirmation email to **foo@example.com**. Please click the link to verify."
     * 按钮："Didn't receive? Resend" / "Back to sign in"

### 3.3 邮箱验证完整流程

```
[注册成功] → [Supabase发邮件] → [用户点击邮件链接]
    ↓                                ↓
[提示"请查看邮箱"]          [跳转 /auth/callback?code=xxx]
                                     ↓
                        [后端exchangeCodeForSession]
                                     ↓
                        [设置httpOnly cookie + 跳转 /courses]
```

**边界情况**：

| 场景 | 行为 |
|------|------|
| 未验证就登录 | 返回403 + 提供"重发邮件"按钮 |
| 验证链接过期（24小时） | 跳转`/login?error=link_expired` |
| 多次点击验证链接 | 仍成功跳转（Supabase幂等处理） |

---

## 4. P3 课程列表（`/courses`）

### 4.1 布局

* **顶部**：标题 + "New course"按钮
* **主体**：课程卡片网格
  * 课程名称 / 学校·学期 / 文件数
  * 点击卡片 → 进入P4
  * 右上角菜单：Edit / Delete
* **空状态**："You don't have any courses yet." + "Create your first course"按钮

### 4.2 交互

* **新建课程**：
  * 未达配额 → 弹出对话框（输入名称/学校/学期）
  * 已达配额 → 按钮禁用 + tooltip："For this experiment, you can create up to 6 courses."
* **删除课程**：二次确认："This will also delete all uploaded materials."

---

## 5. P4 课程详情（`/courses/[courseId]`）

### 5.1 布局

* **顶部**：面包屑 + 课程名
* **信息栏**：
  * 左侧：课程名/学校·学期/文件统计
  * **右侧**：**AI配额快速预览**
    * 格式："AI quota: 27/50 interactions remaining"
    * >90%显示黄色警告
    * 点击"View details" → P7
* **操作区**：Upload PDF / Generate course outline / ...菜单
* **主体**：按类型分组的文件列表
  * 分组：Lecture notes / Homework / Exams / Other materials
  * 卡片：文件名 / 页数 / 上传时间 / 类型标签
  * 点击 → P5

### 5.2 交互

* **上传PDF**：
  * 多文件选择，拖拽支持
  * 为每个文件指定类型（下拉选择）
  * 同名冲突 → 提示"A file named 'XXX' already exists."
  * 显示进度条，成功后自动解析页数
* **修改类型**：卡片上类型下拉菜单，即时更新

---

## 6. P5 PDF阅读与AI学习（`/courses/[courseId]/files/[fileId]`）

### 6.1 布局结构

```
┌─────────────────────────────────────────────────────────┐
│ 面包屑 + 文件名                         [配额提示]        │
├──────────────────────┬──────────────────────────────────┤
│                      │  [Explain this page] 按钮         │
│                      ├──────────────────────────────────┤
│   左侧：PDF阅读器     │  贴纸栏（上半部分）                │
│   - 分页/滚动模式     │  - 自动讲解贴纸（浅色背景）         │
│   - 缩放/页码跳转     │  - 手动讲解贴纸（深色背景）         │
│   - 记忆lastReadPage  │  - 支持折叠/展开                  │
│                      ├──────────────────────────────────┤
│                      │  问答/总结区（下半部分）            │
│                      │  - 历史记录                       │
│                      │  - 提问输入框                     │
└──────────────────────┴──────────────────────────────────┘
```

### 6.2 关键功能

#### 6.2.1 AI回复格式（通用）

* 所有AI内容统一为Markdown文本（贴纸/问答/总结）
* 前端`MarkdownRenderer`支持：
  * 完整Markdown语法
  * LaTeX公式：`$...$`行内，`$$...$$`块级
  * 代码高亮：` ```python`等

#### 6.2.2 自动讲解贴纸（Explain this page）

**触发**：用户点击右侧"Explain this page"按钮

**生成策略**：

| PDF风格 | 处理方式 | 贴纸数量 |
|---------|---------|---------|
| PPT风格 | 按页，识别2-5个核心要点 | 5-6条/页上限 |
| 长文本 | 按段落+语义分块（200-300字/块） | 5-6条/页上限 |

**展示**：
* 顶部标签："Auto" / 图标
* 浅背景色区分手动贴纸
* 最大高度300-400px，超出内部滚动

**持久化**：
* 首次生成存储到后端
* 重开文档优先从存量恢复，不重复调用AI

#### 6.2.3 选中文本讲解（Manual）

**从PDF选中**：
1. 用户在左侧PDF拖选文本
2. 浮层显示"AI讲解"按钮
3. 点击 → 右侧插入手动贴纸
   * 顶部标签："From selection"
   * 显示原文片段 + AI解释

**从贴纸追问**：
1. 在贴纸正文中选中文本
2. 浮层"AI讲解"
3. 生成新贴纸，紧挨上一条（`parentId`指向上一条）
4. UI显示轻微缩进/连接线（追问链）

**排序规则**：
* 自动贴纸按页面顺序从上到下
* 手动贴纸：
  * 从PDF选中 → 插入到对应页面位置
  * 从贴纸追问 → 紧挨父贴纸向下

**折叠/展开**：
* 右上角折叠图标
* 折叠状态：保留头部+一行摘要
* 展开状态：完整内容，超出内部滚动
* 状态持久化，重开文档恢复

#### 6.2.4 问答（Q&A）

**位置**：右侧下半部分

**流程**：
1. 输入问题："Ask a question about this PDF..."
2. 提交 → 调用`POST /api/ai/qa`
3. 回答显示为气泡卡片：
   * Markdown主体
   * 引用："References: p.3, p.10"
   * 点击页码 → 左侧滚动到对应页

**与贴纸区别**：
* 用于跨页/综合性问题
* 不自动变成贴纸

#### 6.2.5 文档/章节总结

**入口**：问答区顶部工具栏
* "Summarize this document"
* "Summarize this section"

**展示**：以Summary Card形式在问答区显示，可折叠/展开

#### 6.2.6 扫描件处理

* 右侧贴纸栏顶部提示："This PDF seems to be a scanned document. AI explanations are not available."
* 隐藏"Explain this page"按钮
* 禁用选中文本讲解（因无法选中）
* 问答区建议禁用（MVP阶段）

### 6.3 联动与记忆

* **点击贴纸** → 左侧PDF滚动到对应页/位置
* **打开文件** → 左侧跳转到`lastReadPage`，右侧加载该页附近贴纸

---

## 7. P6 课程级提纲（`/courses/[courseId]/outline`）

### 7.1 布局

* **顶部**：课程名 + "Course outline"
* **主体**：树状结构
  * 一级：章节（如"Chapter 1: Limits and Continuity"）
  * 二级：小节（如"1.1 Limit definition"）
  * 内容：核心概念 / 关键公式（LaTeX） / 典型题型 / 相关PDF链接

### 7.2 交互

* 首次生成：点击P4的"Generate course outline" → 跳转P6显示loading → 完成展示
* 更新资料后：点击"Regenerate outline"刷新
* 点击"View in PDF"或页码 → 跳转P5对应位置

---

## 8. P7 配额与使用（`/account/usage`）

### 8.1 布局

**第一部分：全局配额**
* **Courses created**: "4 / 6 courses"
* 进度条 + 说明："For this experiment, you can create up to 6 courses."

**第二部分：AI配额（按课程折叠卡片）**

示例卡片：
```
┌─────────────────────────────────────────────┐
│ 📚 Calculus I                               │
│                                             │
│ Learning interactions:      23 / 50  ███░░ │
│ Document summaries:          3 / 10  ███░░ │
│ Section summaries:           5 / 15  ███░░ │
│ Course outlines:             1 / 3   ███░░ │
│                                             │
│ [View course →]                             │
└─────────────────────────────────────────────┘
```

* 进度条颜色：绿色<70%，黄色70-90%，红色>90%
* 点击课程名 → P4

**空状态**："You haven't created any courses yet." + "Create your first course"

### 8.2 配额说明文案（hover显示）

* **课程数量**："For this experiment, you can create up to 6 courses. Each course gets a full set of AI quotas."
* **learningInteractions**："AI explanations and Q&A up to 50 times per course. Includes: text selections, follow-ups, open-ended Q&A."
* **documentSummary**："Up to 10 document summaries per course."
* **sectionSummary**："Up to 15 section summaries per course."
* **courseSummary**："Up to 3 course outlines per course."

---

## 9. 典型用户流程

### F1 创建课程并上传资料（首次）

1. 访问`/login` → 跳转`/register`注册
2. 注册成功 → 提示"查看邮箱"（不自动登录）
3. 点击邮件链接 → `/auth/callback` → 设置cookie → `/courses`
4. 点击"New course" → 输入课程名/学校/学期 → 创建
5. 进入P4 → "Upload PDF" → 选择文件+指定类型 → 上传
6. 点击PDF卡片 → 进入P5阅读与AI学习

### F2 考前冲刺生成提纲

1. 登录 → P3选择课程 → P4
2. 确认已上传主要Lecture/Homework/Exam
3. 逐个打开PDF → P5生成文档/章节总结
4. 回到P4 → "Generate course outline" → P6
5. 浏览提纲 → 识别高频考点
6. 点击"View in PDF" → 跳转P5查看原文
7. 若更新资料 → P6点击"Regenerate outline"

### F3 跟课场景（整学期）

1. P3 → P4选择当周讲义 → P5
2. 左侧跳转到`lastReadPage`，右侧显示已有贴纸
3. 点击"Explain this page" → 生成2-6条自动贴纸
4. 阅读推导，感觉困难 → 选中文本 → "AI讲解"
5. 对贴纸某句仍有疑问 → 选中贴纸文本 → "AI讲解" → 追问链
6. 贴纸增多 → 折叠已理解的，展开当前关注的
7. 需整体理解 → 问答区"Summarize this section"
8. 第二天重开 → 左侧回到lastReadPage，右侧恢复所有贴纸及折叠状态

### F4 配额触顶体验

1. 高频使用后，`learningInteractions`接近上限
   * P5顶部显示："You're close to the limit..."
2. 继续触发选中讲解/追问/问答
   * 若在配额内 → 正常执行
   * 若触顶 → 弹出提示："You've reached the usage limit. You can still read PDFs and existing notes."
   * 按钮置灰，hover显示tooltip
3. 自动讲解不受影响（只要未达20次/天）
4. 点击"View details" → P7
   * 对应卡片高亮显示已达上限
5. 仍可浏览PDF、已有贴纸、已生成的总结和提纲
