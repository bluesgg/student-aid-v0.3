# 02 页面与流程设计（冻结版本）

> **文档定位**：定义用户视角的页面结构与交互流程;数据结构见03,技术实现见04。
> **版本状态**：✅ 冻结 - 基于审计修正的最终版本

---

## 1. 页面总览

| 页面ID | 页面名称 | 路径 | 说明 |
|--------|---------|------|------|
| P1 | 登录页 | `/login` | 邮箱+密码登录,引导注册 |
| P2 | 注册页 | `/register` | 新用户注册,邮箱验证流程 |
| P3 | 课程列表 | `/courses` | 课程卡片,新建/编辑/删除 |
| P4 | 课程详情 | `/courses/[courseId]` | 按类型分组显示PDF |
| P5 | PDF阅读与AI学习 | `/courses/[courseId]/files/[fileId]` | 左侧PDF + 右侧AI面板 |
| P6 | 课程级提纲 | `/courses/[courseId]/outline` | 整门课程复习提纲 |
| P7 | 配额与使用 | `/account/usage` | 课程数量与AI配额查看 |

---

## 2. P1/P2 认证页面

### 2.1 P1 登录页

**状态处理**（错误码见03_API §6）：

| 场景 | HTTP状态 | 前端行为 |
|------|---------|---------|
| 成功 | 200 | 跳转`/courses` |
| 邮箱未验证 | 403 + `EMAIL_NOT_CONFIRMED` | 显示警告 + "Resend verification email"按钮 |
| 密码错误 | 401 + `INVALID_CREDENTIALS` | 提示"Invalid email or password" |

**URL参数错误提示**：

| 参数 | 提示文案 | 恢复操作 |
|------|---------|---------|
| `?error=verification_failed` | "Email verification failed or link expired. Please try again." | 显示输入邮箱对话框 + "Resend email"按钮 |
| `?error=session_expired` | "Your session has expired. Please sign in again." | 正常登录表单 |
| `?error=link_expired` | "The verification link has expired. Please request a new one." | 显示输入邮箱对话框 + "Resend verification email"按钮 |

### 2.2 P2 注册页

**提交流程**：
1. 用户点击"Create account"
2. 注册成功→不自动登录,停留当前页
3. 显示提示："Check your email. We've sent a confirmation email to **foo@example.com**. Please click the link to verify."

**邮箱验证完整流程**（认证架构见03_API §1.1）：
```
[注册成功] → [Supabase发邮件] → [用户点击邮件链接] → [/auth/callback?code=xxx]
    ↓                                                        ↓
[提示"请查看邮箱"]                                  [exchangeCodeForSession]
                                                             ↓
                                                [设置httpOnly cookie + 跳转/courses]
```

**边界情况**：
* 未验证就登录 → 返回403 + "重发邮件"按钮
* 验证链接过期(24h) → 跳转`/login?error=link_expired`
* 多次点击验证链接 → 仍成功跳转(Supabase幂等处理)

---

## 3. P3 课程列表

**布局**：
* 顶部："New course"按钮
* 主体：课程卡片网格(课程名/学校·学期/文件数)
* 空状态："You don't have any courses yet." + "Create your first course"按钮

**交互**：
* 新建课程：未达配额→弹出对话框;已达配额→按钮禁用 + tooltip:"For this experiment, you can create up to 6 courses."
* 删除课程：二次确认:"This will also delete all uploaded materials."

**边界情况**：
* 快速双击"New course"→前端禁用按钮直到API响应返回
* 删除课程后浏览器后退→API返回404,显示"课程已删除"+返回课程列表按钮

---

## 4. P4 课程详情

**信息栏**：
* 左侧：课程名/学校·学期/文件统计
* **右侧**：**AI配额快速预览**(账户全局,配额定义见01_PRD §3.1)
  * 格式："AI quota: 87/150 interactions remaining"
  * >90%显示黄色警告
  * 点击"View details" → P7

**主体**：按类型分组文件列表(Lecture notes/Homework/Exams/Other materials)

**上传PDF**：
* 多文件选择,拖拽支持
* 为每个文件指定类型
* 显示进度条,成功后自动解析页数
* 文件名冲突处理：弹出对话框,提供3个选项(自动重命名/替换原文件/取消)
* 扫描件警告：上传结果中显示⚠️标记 + "检测到扫描件,AI功能可能不可用"

**边界情况**：
* 上传50%时刷新页面→上传中断,后端清理临时文件,前端重新显示上传界面
* 文件名冲突选择"替换"→删除旧文件及其所有AI数据(贴纸/总结),上传新文件

---

## 5. P5 PDF阅读与AI学习

### 5.1 布局结构

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

### 5.2 关键功能

#### 自动讲解贴纸(Explain this page)

**生成策略**：

| PDF风格 | 处理方式 | 贴纸数量 |
|---------|---------|---------|
| PPT风格 | 按页,识别2-5个核心要点 | 5-6条/页上限 |
| 长文本 | 按段落+语义分块(200-300字/块) | 5-6条/页上限 |

**展示**：顶部标签"Auto",浅背景色,最大高度300-400px,超出内部滚动

**缓存行为**（见03_API §3.3）：
* 查询数据库是否已有(userId,fileId,page)的自动贴纸
* 有则直接返回,不重新生成,不扣配额和限流计数
* 无则调用AI生成并存储

**边界情况**：
* 快速双击"Explain this page"→前端禁用按钮直到响应返回
* 已有贴纸的页面再次点击→返回现有数据,不重新生成
* AI streaming中途断开→已返回首token则扣配额,否则不扣

#### 选中文本讲解(Manual)

**从PDF选中**：
1. 用户在左侧PDF拖选文本
2. 浮层显示"AI讲解"按钮
3. 点击→右侧插入手动贴纸(顶部标签"From selection",显示原文片段+AI解释)

**从贴纸追问**：
1. 在贴纸正文中选中文本
2. 浮层"AI讲解"
3. 生成新贴纸,紧挨上一条(`parentId`指向上一条,数据模型见03_API §3.0.1)
4. UI显示轻微缩进/连接线(追问链)
5. **深度限制**：最大深度3层(根贴纸→追问1→追问2);达到上限后禁用按钮,提示"已达追问深度上限,请在原文中重新选择"

**排序规则**：
* 自动贴纸按页面顺序从上到下
* 手动贴纸：从PDF选中→插入到对应页面位置;从贴纸追问→紧挨父贴纸向下

**边界情况**：
* 连续对同一文本片段点击"选中讲解"→每次请求都扣配额(用户可能想重新生成)
* 贴纸折叠操作失败→前端乐观更新,后台重试3次,失败后回滚UI并显示"保存失败"

#### 问答(Q&A)

**流程**：
1. 输入问题："Ask a question about this PDF..."
2. 提交→调用`POST /api/ai/qa`
3. 回答显示为气泡卡片(Markdown主体 + 引用:"References: p.3, p.10")
4. 点击页码→左侧滚动到对应页

**与贴纸区别**：用于跨页/综合性问题,不自动变成贴纸

#### 文档/章节总结

**入口**：问答区顶部工具栏("Summarize this document"/"Summarize this section")

**展示**：以Summary Card形式在问答区显示,可折叠/展开

**边界情况**：
* 总结生成中再次点击→返回409 + `SUMMARY_IN_PROGRESS`,显示"正在生成"并禁用按钮
* 已有总结再次点击→返回现有总结,不重新生成,不扣配额

#### 扫描件处理

* 右侧贴纸栏顶部提示："This PDF seems to be a scanned document. AI explanations are not available."
* 隐藏"Explain this page"按钮
* 禁用选中文本讲解(因无法选中)
* 问答区建议禁用(MVP阶段)

---

## 6. P6 课程级提纲

**布局**：
* 顶部：课程名 + "Course outline"
* 主体：树状结构(一级:章节,二级:小节,内容:核心概念/关键公式/典型题型/相关PDF链接)

**交互**：
* 首次生成：点击P4的"Generate course outline"→跳转P6显示loading→完成展示
* 更新资料后：点击"Regenerate outline"刷新
* 点击"View in PDF"或页码→跳转P5对应位置

---

## 7. P7 配额与使用

**第一部分：全局配额**
* **Courses created**: "4 / 6 courses"
* 进度条 + 说明："For this experiment, you can create up to 6 courses."

**第二部分：AI配额(账户全局,配额定义见01_PRD §3.1)**

```
┌─────────────────────────────────────────────┐
│ 🤖 AI Usage (Account-wide)                  │
│                                             │
│ Learning interactions:     87 / 150  ████░ │
│ Document summaries:        23 / 100  ██░░░ │
│ Section summaries:         15 / 65   ██░░░ │
│ Course outlines:            3 / 15   █░░░░ │
│                                             │
│ Auto-explain (daily):     145 / 300  ████░ │
│ Resets at: 2025-01-21 00:00 UTC             │
└─────────────────────────────────────────────┘
```

**进度条颜色**：绿色<70%,黄色70-90%,红色>90%

**说明文案**：
* "All AI quotas are shared across all your courses."
* "Auto-explain quota resets daily at 00:00 UTC."

---

## 8. 典型用户流程

### F1 创建课程并上传资料(首次)

1. 访问`/login`→跳转`/register`注册
2. 注册成功→提示"查看邮箱"(不自动登录)
3. 点击邮件链接→`/auth/callback`→设置cookie→`/courses`
4. 点击"New course"→输入课程名/学校/学期→创建
5. 进入P4→"Upload PDF"→选择文件+指定类型→上传
6. 点击PDF卡片→进入P5阅读与AI学习

### F2 考前冲刺生成提纲

1. 登录→P3选择课程→P4
2. 确认已上传主要Lecture/Homework/Exam
3. 逐个打开PDF→P5生成文档/章节总结
4. 回到P4→"Generate course outline"→P6
5. 浏览提纲→识别高频考点
6. 点击"View in PDF"→跳转P5查看原文

### F3 跟课场景(整学期)

1. P3→P4选择当周讲义→P5
2. 左侧跳转到lastReadPage,右侧显示已有贴纸
3. 点击"Explain this page"→生成2-6条自动贴纸
4. 阅读推导,感觉困难→选中文本→"AI讲解"
5. 对贴纸某句仍有疑问→选中贴纸文本→"AI讲解"→追问链
6. 贴纸增多→折叠已理解的,展开当前关注的
7. 需整体理解→问答区"Summarize this section"
8. 第二天重开→左侧回到lastReadPage,右侧恢复所有贴纸及折叠状态

---

## 9. 错误恢复流程

### 9.1 注册与验证错误

**重复注册**：
* 邮箱未验证→显示:"该邮箱已注册但未验证,是否重发验证邮件?" + [重发邮件]按钮
* 邮箱已验证→显示:"该邮箱已注册,请直接登录" + [前往登录]链接

**验证链接过期**：跳转`/login?error=link_expired`,显示输入邮箱对话框 + "Resend email"按钮

**重发邮件触发限流**：显示"请求过于频繁,请在X分钟后重试",禁用按钮,倒计时结束后恢复

### 9.2 文件上传错误

**文件名冲突**：弹出对话框,提供3个明确选项(重命名/替换/取消)

**多文件部分失败**：
```
上传结果：
✓ Week2_Lecture.pdf 上传成功
❌ Week1_Lecture.pdf 文件名冲突
   [自动重命名] [替换原文件] [取消]
❌ scan.doc 不支持的文件类型(仅支持PDF)
```

### 9.3 AI请求错误

**配额用尽**（错误码见03_API §6）：
* 按钮置灰,hover显示"配额已用尽(150/150),所有课程暂时无法使用AI讲解功能"
* 提供[View quota details]链接跳转P7

**自动讲解限流**：
* "Explain this page"按钮置灰
* 显示倒计时:"今日自动讲解已用完(300/300),将在X小时后重置"
* 提示:"您仍可使用选中文本讲解"
* 选中讲解按钮保持可用(如learningInteractions配额未用尽)

**请求超时**：
* 15s无响应→显示"AI正在处理,请稍候..." + [取消]按钮
* 30s超时→显示"请求超时,请稍后重试" + [重试]按钮,不扣配额

**AI服务不可用**：
* OpenAI不可用→显示"AI服务暂时不可用,请稍后重试",不扣配额
* Supabase不可用→显示"服务暂时不可用,请稍后重试"

### 9.4 会话过期

**会话自然过期**：
* 检测到401 UNAUTHORIZED
* 清理本地状态(React Query缓存等)
* 跳转到`/login?error=session_expired`
* 显示:"Your session has expired. Please sign in again."

**深链接访问**：
* 未登录用户访问`/courses/123/files/456`
* 保存原URL到sessionStorage
* 跳转到`/login`
* 登录成功后自动跳转回原URL

### 9.5 边界情况汇总

**重复请求**：
* 快速双击AI按钮→前端禁用直到响应返回
* 已有自动贴纸的页面再次点击→返回现有数据,不重新生成
* 总结生成中再次点击→返回409,显示"正在生成"

**网络中断**：
* AI streaming中途断开→已返回首token则扣配额,否则不扣
* 贴纸折叠操作失败→前端乐观更新,后台重试3次,失败后回滚UI
* 上传中途刷新页面→上传中断,后端清理临时文件

**状态不一致**：
* 配额显示与实际不符→API返回429时更新本地状态
* 多标签页操作→以数据库状态为准,刷新时覆盖前端状态
* 删除课程后浏览器后退→API返回404,显示"课程已删除"
