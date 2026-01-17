# 03 API设计

> **文档定位**：后端接口规范,定义请求/响应契约;前端实现见04。

---

## 0. 全局约定

### 0.1 术语表

| 术语 | 定义 |
|------|------|
| Sticker | AI生成的讲解卡片,锚定在PDF特定位置,支持追问链 |
| Quota Bucket | 配额桶,按操作类型分组的使用限制 |
| Canonical Doc | 基于pdfHash的规范化文档ID,用于跨用户共享缓存 |
| Session | 自动讲解会话,管理滑动窗口内多页讲解的生命周期 |
| Anchor | 贴纸在PDF上的锚定位置(文本片段+坐标或多个区域) |
| Generation ID | 异步生成任务的UUID,用于轮询状态 |
| Trace ID | 请求的UUID追踪标识,用于全链路追踪和问题排查 |

### 0.2 数据类型规范

| 类型 | 格式 | 示例 | 说明 |
|------|------|------|------|
| 时间 | `yyyy-MM-ddTHH:mm:ssZ` (UTC) | `2025-01-10T10:00:00Z` | 禁止Unix时间戳 |
| ID | UUID v4 (36字符含连字符) | `550e8400-e29b-41d4-a716-446655440000` | 客户端不应假设格式 |
| 枚举 | PascalCase | `Lecture`/`Homework` | 需支持未知值fallback |
| 布尔 | `true`/`false` | - | 禁止数字或字符串 |

**空值语义**：`null`=未设置, `""`=有意义空值, `0`=数值零, 缺省字段=可选未提供

### 0.3 字段验证规则

| 字段类型 | 最小 | 最大 | 规则 |
|----------|------|------|------|
| email | - | 255字符 | RFC 5322,必含@和域名 |
| password | 8字符 | 128字符 | 必含大写+小写+数字 |
| course.name | 1字符 | 100字符 | 同用户下唯一 |
| file.name | 1字符 | 255字符 | 含扩展名,同课程下唯一 |
| pageCount | 1 | 200 | 超过200页返回400 |
| selectedText | 1字符 | 10000字符 | 超过返回400 |
| question | 1字符 | 5000字符 | Q&A问题长度 |

### 0.4 响应格式

**成功**：
```json
{
  "ok": true,
  "data": { /* 业务数据 */ },
  "traceId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-01-10T10:00:00Z"
}
```

**失败**：
```json
{
  "ok": false,
  "error": {
    "code": "QUOTA_EXCEEDED",
    "message": "AI quota exceeded",
    "details": { /* 可选上下文 */ }
  },
  "traceId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-01-10T10:00:00Z"
}
```

**字段说明**：
- `ok`: 布尔,标识成功/失败
- `data`: 成功时的业务数据(仅成功时存在)
- `error.code`: 错误码(见§7)
- `error.message`: 英文错误描述
- `error.details`: 可选错误上下文
- **`traceId`**: 所有响应必含,UUID v4格式,服务端生成,用于问题追踪
- `timestamp`: 服务端处理完成时间(UTC)

### 0.5 鉴权与权限

**鉴权**：
- 除`/api/auth/*`的login/register/resend外,所有`/api/*`接口需登录
- httpOnly cookie会话(`sb-<project-ref>-auth-token`)
- 前端必须`credentials: 'include'`,禁止手动传`Authorization`头

**资源所有权**：
- 课程接口：验证`course.user_id = current_user.id`
- 文件接口：验证`course.user_id = current_user.id` + `file.course_id = :courseId`
- 贴纸接口：验证`sticker.user_id = current_user.id`
- 无权限访问返回404(安全考虑,不暴露资源存在性)

**管理员权限**：
- 认证：`x-admin-secret`请求头
- 权限：无限AI配额,可查看全局聚合数据

### 0.6 配额消耗原则

适用于所有AI接口：
1. **成功扣除**：仅当AI返回完整响应时扣配额
2. **失败不扣**：客户端超时/服务端错误/LLM不可用
3. **部分扣除**：Streaming已返回首token但中途中断→仍扣配额
4. **防滥用**：相同(userId+endpoint+参数hash)在5秒内的重复请求返回409

**MVP降级**：若无Redis,允许重复请求但记录WARNING日志,客户端需自行防重(禁用按钮)

### 0.7 数据收集政策

详见01_PRD §2.6

**必须收集**：账户身份、课程结构、PDF元数据、AI学习数据、配额使用
**建议收集**：轻量行为数据、PDF hash、客户端状态、安全审计、成本核算
**不收集**：真实姓名、手机号、完整IP、设备指纹、详细行为时间线、用户PDF内容
**纯前端**：P5布局偏好存localStorage,不上传后端
**删除**：删除课程/文件时级联删除相关AI数据;审计日志定期自动清理(30-90天)
**共享缓存**：用户删除数据不影响跨用户共享的缓存(shared_sticker_cache/pdf_context_entries)

---

## 1. 认证

### 1.1 认证架构

**会话管理**：Supabase JWT(access token 1h + refresh token 30d)存储在httpOnly cookie,通过`@supabase/ssr`自动管理

**邮箱验证**：注册→发邮件→点击链接→`/auth/callback?code=xxx`→exchangeCodeForSession→设置cookie+跳转/courses

### 1.2 POST /api/auth/register

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| email | string | ✓ | 符合RFC 5322 |
| password | string | ✓ | 8-128字符,含大写+小写+数字 |

**响应**：
```json
{
  "ok": true,
  "data": {
    "user": { "id": "user_123", "email": "foo@example.com" },
    "needsEmailConfirmation": true
  },
  "traceId": "...",
  "timestamp": "..."
}
```

**行为**：不自动登录,必须先完成邮箱验证

**错误码**：`EMAIL_ALREADY_EXISTS`(409), `INVALID_INPUT`(400), `WEAK_PASSWORD`(400)

### 1.3 GET /auth/callback

| 参数 | 必填 | 说明 |
|------|------|------|
| code | ✓ | Supabase一次性确认码(24h有效) |

**成功**：设置cookie,重定向到`/courses`
**失败**：重定向到`/login?error=verification_failed`

### 1.4 POST /api/auth/login

| 参数 | 类型 | 必填 |
|------|------|------|
| email | string | ✓ |
| password | string | ✓ |

**响应data**：`{ "user": { "id": "...", "email": "..." } }`

**错误码**：`INVALID_CREDENTIALS`(401), `EMAIL_NOT_CONFIRMED`(403)

### 1.5 POST /api/auth/resend-confirmation

| 参数 | 类型 | 必填 |
|------|------|------|
| email | string | ✓ |

**限流**：5次/邮箱/15分钟, 10次/IP/小时

**错误码**：`RATE_LIMIT_EXCEEDED`(429,返回`details.retryAfter`秒数)

### 1.6 GET /api/auth/me

**响应data**：
```json
{
  "id": "user_123",
  "email": "foo@example.com",
  "createdAt": "2025-01-01T12:00:00Z"
}
```

**错误码**：`UNAUTHORIZED`(401)

### 1.7 POST /api/auth/logout

**行为**：清理cookie

### 1.8 POST /api/auth/reset-password-request

**用途**：请求密码重置(发送重置邮件)

| 参数 | 类型 | 必填 |
|------|------|------|
| email | string | ✓ |

**行为**：发送包含一次性重置链接的邮件(24h有效),无论邮箱是否存在均返回成功(防枚举)

**限流**：5次/邮箱/15分钟

### 1.9 POST /api/auth/reset-password

**用途**：执行密码重置(点击邮件链接后)

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| token | string | ✓ | 邮件中的token |
| newPassword | string | ✓ | 8-128字符,含大写+小写+数字 |

**错误码**：`INVALID_TOKEN`(400), `WEAK_PASSWORD`(400)

---

## 2. 课程与资料

### 2.1 GET /api/courses

**响应data.items**：
```json
[{
  "id": "course_1",
  "name": "Calculus I",
  "school": "ABC University",
  "term": "Spring 2025",
  "fileCount": 12,
  "lastVisitedAt": "2025-03-10T10:00:00Z",
  "createdAt": "2025-01-05T09:00:00Z"
}]
```

**排序**：按`lastVisitedAt`降序
**分页**：MVP阶段无分页(课程数上限6个)

### 2.2 POST /api/courses

| 参数 | 类型 | 必填 | 约束 |
|------|------|------|------|
| name | string | ✓ | 1-100字符,同用户下唯一 |
| school | string | - | 最大200字符 |
| term | string | - | 最大50字符 |

**规则**：创建前检查课程数量配额(见§4)

**错误码**：`COURSE_LIMIT_REACHED`(403), `DUPLICATE_COURSE_NAME`(409)

### 2.3 PATCH /api/courses/:courseId

| 参数 | 类型 | 必填 | 约束 |
|------|------|------|------|
| name | string | - | 1-100字符 |
| school | string | - | 最大200字符 |
| term | string | - | 最大50字符 |

**错误码**：`NOT_FOUND`(404), `DUPLICATE_COURSE_NAME`(409), `FORBIDDEN`(403)

### 2.4 DELETE /api/courses/:courseId

**行为**：删除课程及其下所有文件与AI数据(级联删除)

**响应data**：`{ "message": "...", "deletedFileCount": 5 }`

### 2.5 GET /api/courses/:courseId

**响应data**：课程详情+文件列表

**文件字段**：
```json
{
  "id": "file_1",
  "name": "Week1_Lecture.pdf",
  "type": "Lecture",
  "pageCount": 25,
  "isScanned": false,
  "uploadedAt": "2025-01-06T10:00:00Z",
  "lastReadPage": 10
}
```

**排序**：文件按`uploadedAt`降序

### 2.6 GET /api/courses/:courseId/files/:fileId

**响应data**：文件详情+`pdfUrl`(Supabase Storage公开URL)

**说明**：`lastReadPage`初始值为1

### 2.7 POST /api/courses/:courseId/files

**Content-Type**：multipart/form-data

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | File | ✓ | PDF文件 |
| type | string | ✓ | `Lecture`/`Homework`/`Exam`/`Other` |
| name | string | - | 不提供则使用原文件名,最大255字符 |

**处理流程**：
1. 检查文件名冲突(同课程下文件名不可重复)
2. 上传到Supabase Storage
3. 检测是否扫描件+提取页数
4. 创建数据库记录
5. 触发后台图片提取(≤50页全量,>50页前50页立即+剩余延迟)

**错误码**：`FILE_NAME_CONFLICT`(409), `INVALID_FILE_TYPE`(400), `FILE_TOO_LARGE`(413,建议50MB)

### 2.8 GET /api/courses/:courseId/files/:fileId/images

**用途**：获取PDF图片元数据

**查询参数**：`page`(可选,筛选特定页码)

**响应data**：
```json
{
  "extractionStatus": "completed",
  "images": [{
    "id": "img_1",
    "page": 5,
    "x": 0.1, "y": 0.2, "width": 0.3, "height": 0.2
  }]
}
```

**说明**：支持懒加载,未提取页面请求时触发后台提取;坐标为归一化值(0-1)

### 2.8.1 POST /api/courses/:courseId/files/:fileId/images/feedback

**用途**：提交图片检测反馈(误检/漏检/边界错误)

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| detectedImageId | string | - | 反馈已检测图片时提供 |
| page | number | ✓ | 页码 |
| feedbackType | string | ✓ | `false_positive`/`false_negative`/`wrong_boundary` |
| correctRect | object | - | 对`wrong_boundary`/`false_negative`必需 |
| comment | string | - | 最大500字符 |

**行为**：
- 漏检(`false_negative`)时自动创建`detected_image`记录(跨用户可见)
- 存储反馈到`image_feedback`表
- 限流：10次/用户/小时

**错误码**：`FILE_NOT_FOUND`(404), `INVALID_PAGE`(400), `INVALID_RECT`(400), `RATE_LIMIT_EXCEEDED`(429)

### 2.9 DELETE /api/courses/:courseId/files/:fileId

**行为**：删除文件及其所有AI数据(贴纸/总结/检测到的图片,级联删除)

---

## 2.10 用户偏好设置

### 2.10.1 GET /api/user/preferences

**响应data**：
```json
{
  "uiLocale": "en",
  "explainLocale": "zh"
}
```

**说明**：新用户默认均为`"en"`

### 2.10.2 PATCH /api/user/preferences

| 参数 | 类型 | 必填 | 可选值 |
|------|------|------|--------|
| uiLocale | string | - | `en`/`zh` |
| explainLocale | string | - | `en`/`zh` |

**说明**：支持仅更新其中一个字段,`uiLocale`更改后前端触发页面刷新

---

## 2.11 上下文库API

### 2.11.1 POST /api/courses/:courseId/files/:fileId/extract-context

**触发时机**：首次打开PDF时自动调用

**响应data**：
```json
{
  "extractionStatus": "extracting",
  "message": "Context extraction started"
}
```

**后台处理**：
- 检查pdfHash缓存,有则直接关联用户
- 无缓存：分批提取→AI识别知识点→自评分(保留≥0.7)→去重→存入`pdf_context_entries`
- 使用Supabase Realtime推送进度

**配额**：20个PDF提取/用户/月(contextExtraction桶),超出返回403

**边界情况**：扫描件返回400 + "PDF has no text layer";失败时状态更新为'failed',可重试

### 2.11.2 GET /api/courses/:courseId/files/:fileId/context-status

**响应data**：
```json
{
  "extractionStatus": "extracting",
  "extractionProgress": 45,
  "totalEntries": 23,
  "lastExtractedAt": "2025-01-15T10:30:00Z"
}
```

**字段说明**：`extractionStatus`为`pending`/`extracting`/`completed`/`failed`

---

## 2.12 账户管理

### 2.12.1 DELETE /api/account

**用途**：删除用户账户及所有数据

**请求**：
```json
{
  "confirmText": "DELETE"
}
```

**行为**：
- 验证confirmText必须为"DELETE"
- 级联删除所有课程、文件、贴纸、配额记录
- 清理Supabase Storage中的PDF文件
- 清理user_preferences、user_context_scope
- 保留audit_log 30天后自动清理
- 撤销所有活跃会话
- 共享缓存(pdf_context_entries/shared_sticker_cache)不受影响

**响应**：
```json
{
  "ok": true,
  "data": { "message": "Account and all data deleted successfully" },
  "traceId": "...",
  "timestamp": "..."
}
```

**错误码**：`INVALID_INPUT`(400,confirmText不匹配), `UNAUTHORIZED`(401)

---

## 3. AI功能

### 3.0.1 贴纸数据模型

```typescript
interface Sticker {
  id: string                    // UUID
  userId: string                // 所属用户
  courseId: string              // 所属课程
  fileId: string                // 所属文件
  type: 'auto' | 'manual'       // 类型
  page: number                  // 页码(1-indexed)
  anchor: {                     // 位置锚点
    textSnippet?: string        // 原文片段(前后各50字)
    rect?: {                    // 可选,PDF坐标(归一化0-1)
      x: number                 // PPT全页贴纸: x=0
      y: number                 // PPT全页贴纸: y=0
      width: number             // PPT全页贴纸: width=1
      height: number            // PPT全页贴纸: height=1
    }
    anchors?: Array<{           // 多区域锚点(区域选择模式)
      type: 'text' | 'image'
      page: number
      rect: { x: number; y: number; width: number; height: number }
      textSnippet?: string
    }>
    isFullPage?: boolean        // PPT风格标识,true时rect覆盖整页
  }
  parentId: string | null       // 追问链父贴纸ID
  depth: number                 // 追问深度(0-10)
  contentMarkdown: string       // AI生成内容(Markdown格式)
  folded: boolean               // 折叠状态
  currentVersion: number        // 当前版本(1或2)
  createdAt: string             // ISO 8601
  updatedAt: string
}
```

**版本管理表：sticker_versions**：
```typescript
interface StickerVersion {
  id: string                    // UUID
  stickerId: string             // 关联的贴纸ID
  version: number               // 版本号(1或2)
  contentMarkdown: string       // 该版本的内容
  createdAt: string
}
```

**说明**：采用循环替换策略,最多保留2个版本

**自动讲解会话表：auto_explain_sessions**：
```typescript
interface AutoExplainSession {
  id: string                    // UUID
  userId: string
  fileId: string
  status: 'active' | 'completed' | 'cancelled'
  startPage: number
  coveredPages: number[]        // 已覆盖页码数组
  pdfType: 'ppt' | 'text'       // PDF类型检测结果
  createdAt: string
  updatedAt: string
}
```

**上下文库表：pdf_context_entries**：
```typescript
interface PdfContextEntry {
  id: string                    // UUID
  pdfHash: string               // PDF文件SHA-256哈希(跨用户共享键)
  entryType: 'Definition' | 'Formula' | 'Theorem' | 'Concept' | 'Principle'
  title: string                 // 知识点标题
  content: string               // 知识点内容(英文,Markdown)
  pageRange: { start: number; end: number }
  relevanceScore: number        // AI自评分(0-1)
  createdAt: string
}
```

**用户上下文关联表：user_context_scope**：
```typescript
interface UserContextScope {
  userId: string
  fileId: string
  pdfHash: string
  extractionStatus: 'pending' | 'extracting' | 'completed' | 'failed'
  extractionProgress: number    // 0-100
  totalEntries: number
  lastExtractedAt: string
}
```

### 3.0.2 配额桶

| 配额桶 | 包含操作 | 限制 | HTTP错误码 |
|--------|---------|------|------------|
| learningInteractions | 选中讲解 + 图片解释 + 问答 | 150次/月 | 403 |
| documentSummary | 文档总结 | 100次/月 | 403 |
| sectionSummary | 章节总结 | 65次/月 | 403 |
| courseSummary | 课程级总结 | 15次/月 | 403 |
| autoExplain | 自动讲解(页级生成) | 300次/月 | 403 |
| contextExtraction | PDF知识点提取 | 20个文件/月 | 403 |

**说明**：配额用尽返回HTTP 403 + `QUOTA_EXCEEDED`错误码;限流(请求频率)返回HTTP 429 + `RATE_LIMIT_EXCEEDED`

### 3.0.3 AI文本格式规范

所有AI接口返回的`contentMarkdown`字段遵循以下规范：

**Markdown语法**：标题/粗体/列表/表格/引用
**LaTeX公式**：行内`$...$`，块级`$$...$$`
**代码块**：三反引号+语言标记

**约束**：后端不返回HTML，前端统一用`MarkdownRenderer`渲染

---

### 3.3 POST /api/ai/explain-page

**请求**：
```json
{
  "courseId": "course_1",
  "fileId": "file_1",
  "page": 5,
  "pdfType": "Lecture",
  "locale": "en"
}
```

**参数**：
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| courseId | string | ✓ | 课程ID |
| fileId | string | ✓ | 文件ID |
| page | number | ✓ | 页码(1-indexed) |
| pdfType | string | ✓ | `Lecture`/`Homework`/`Exam`/`Other` |
| locale | string | - | `en`/`zh`,默认用户偏好 |
| mode | string | - | `single`/`window`,默认`single` |
| effectiveMode | string | - | `with_selected_images`用于区域选择 |
| selectedRegions | array | - | 区域选择模式的坐标数组 |

**缓存检查**：
1. 检查用户私有缓存：(userId,fileId,page)
2. 检查共享缓存：(pdfHash,page,promptVersion,locale)
3. 有则返回200,不扣配额
4. 无则启动异步生成,返回202

**响应（缓存命中 - HTTP 200）**：
```json
{
  "ok": true,
  "data": {
    "stickers": [
      {
        "id": "sticker_1",
        "type": "auto",
        "page": 5,
        "anchor": {
          "textSnippet": "...微分的定义是...",
          "rect": { "x": 0.1, "y": 0.2, "width": 0.3, "height": 0.05 }
        },
        "contentMarkdown": "## 微分定义\n\n微分描述的是...",
        "folded": false,
        "currentVersion": 1,
        "createdAt": "2025-01-10T10:00:00Z"
      }
    ],
    "quota": {
      "autoExplain": { "used": 146, "limit": 300, "resetAt": "2025-02-07T00:00:00Z" }
    },
    "cached": true,
    "source": "shared_cache"
  },
  "traceId": "...",
  "timestamp": "..."
}
```

**响应（异步生成中 - HTTP 202）**：
```json
{
  "ok": true,
  "status": "generating",
  "generationId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Sticker generation in progress. Poll /api/ai/explain-page/status/:generationId for updates.",
  "pollInterval": 2000,
  "traceId": "...",
  "timestamp": "..."
}
```

**错误码**：
- `QUOTA_EXCEEDED` (403) - 配额用尽
- `FILE_IS_SCANNED` (400) - 扫描件不支持

### 3.3.1 GET /api/ai/explain-page/status/:generationId

**用途**：轮询异步生成任务状态

**响应（生成中）**：
```json
{
  "ok": true,
  "data": {
    "status": "generating",
    "generationId": "550e8400-...",
    "message": "Sticker generation in progress",
    "pollInterval": 2000
  }
}
```

**响应（完成）**：
```json
{
  "ok": true,
  "data": {
    "status": "ready",
    "stickers": [...],
    "generationTimeMs": 3500
  }
}
```

**响应（失败）**：
```json
{
  "ok": true,
  "data": {
    "status": "failed",
    "error": "AI generation failed",
    "message": "Sticker generation failed. Quota has been refunded."
  }
}
```

### 3.3.2 POST /api/ai/explain-page (Window Mode)

**请求**：
```json
{
  "courseId": "course_1",
  "fileId": "file_1",
  "page": 10,
  "pdfType": "Lecture",
  "locale": "en",
  "mode": "window"
}
```

**行为（window模式）**：
1. 检测PDF类型（PPT风格或文本密集型）
2. 计算初始窗口范围（当前页-2 到 当前页+5）
3. 创建auto_explain_session会话
4. 后台按优先级顺序生成页面讲解：当前页 → +1 → -1 → +2 → +3 → -2 → +4 → +5
5. 返回202和会话信息

**响应（window模式 - HTTP 202）**：
```json
{
  "ok": true,
  "sessionId": "550e8400-...",
  "windowRange": { "start": 8, "end": 15 },
  "pdfType": "ppt",
  "message": "Auto-explain session started."
}
```

**错误码**：`SESSION_EXISTS` (409) - 同一文件已有活跃会话

### 3.3.3 GET /api/ai/explain-page/session/:sessionId

**用途**：获取自动讲解会话状态

**响应**：
```json
{
  "ok": true,
  "data": {
    "sessionId": "550e8400-...",
    "state": "active",
    "windowRange": { "start": 8, "end": 15 },
    "progress": {
      "total": 8,
      "completed": 5,
      "inProgress": 1,
      "failed": 0,
      "pending": 2,
      "percentage": 62
    },
    "pagesCompleted": [8, 9, 10, 11, 12],
    "pagesInProgress": [13]
  }
}
```

### 3.3.4 PATCH /api/ai/explain-page/session/:sessionId

**用途**：更新会话窗口（用户滚动/跳转时）

**请求**：
```json
{
  "currentPage": 12,
  "action": "extend" | "jump" | "cancel"
}
```

### 3.3.5 DELETE /api/ai/explain-page/session/:sessionId

**用途**：取消自动讲解会话

### 3.3.6 POST /api/ai/explain-page/sticker/:stickerId/refresh

**用途**：重新生成贴纸内容（创建新版本）

**限流**：3秒防抖

**响应**：
```json
{
  "ok": true,
  "data": {
    "sticker": {
      "id": "sticker_1",
      "currentVersion": 2,
      "versions": [
        { "version": 1, "contentMarkdown": "...", "createdAt": "..." },
        { "version": 2, "contentMarkdown": "...", "createdAt": "..." }
      ]
    }
  }
}
```

**错误码**：`RATE_LIMIT_EXCEEDED`(429), `NOT_FOUND`(404)

### 3.3.7 PATCH /api/ai/explain-page/sticker/:stickerId/version

**用途**：切换贴纸版本

**请求**：`{ "version": 1 | 2 }`

---

### 3.4 POST /api/ai/explain-selection

**请求**：
```json
{
  "courseId": "course_1",
  "fileId": "file_1",
  "page": 5,
  "selectedText": "微分的定义是...",
  "parentId": null,
  "pdfType": "Lecture",
  "locale": "en"
}
```

**响应**：
```json
{
  "ok": true,
  "data": {
    "sticker": {
      "id": "sticker_2",
      "type": "manual",
      "page": 5,
      "anchor": { "textSnippet": "微分的定义是...", "rect": {...} },
      "parentId": null,
      "depth": 0,
      "contentMarkdown": "## 微分详解\n\n...",
      "folded": false,
      "createdAt": "2025-01-10T10:05:00Z"
    },
    "quota": {
      "learningInteractions": { "used": 88, "limit": 150, "resetAt": "..." }
    }
  }
}
```

**错误码**：
- `QUOTA_EXCEEDED` (403) - learningInteractions配额用尽
- `MAX_DEPTH_REACHED` (400) - 追问链深度超过10层

---

### 3.5 POST /api/ai/qa

**请求**：
```json
{
  "courseId": "course_1",
  "fileId": "file_1",
  "question": "What is the main difference between differentiation and integration?",
  "locale": "en"
}
```

**响应**：
```json
{
  "ok": true,
  "data": {
    "answer": {
      "contentMarkdown": "## 微分与积分的区别\n\n...",
      "references": [
        { "page": 3, "snippet": "微分定义..." },
        { "page": 10, "snippet": "积分定义..." }
      ]
    },
    "quota": {
      "learningInteractions": { "used": 89, "limit": 150, "resetAt": "..." }
    }
  }
}
```

---

### 3.6 POST /api/ai/summarize

**请求**：
```json
{
  "courseId": "course_1",
  "fileId": "file_1",
  "type": "document" | "section",
  "pageRange": { "start": 1, "end": 10 },
  "locale": "en"
}
```

**响应**：
```json
{
  "ok": true,
  "data": {
    "summary": {
      "id": "summary_1",
      "type": "document",
      "contentMarkdown": "## 文档总结\n\n...",
      "createdAt": "2025-01-10T11:00:00Z"
    },
    "quota": {
      "documentSummary": { "used": 24, "limit": 100, "resetAt": "..." }
    }
  }
}
```

**边界情况**：
- 总结生成中再次请求→返回409 + `SUMMARY_IN_PROGRESS`
- 已有总结再次请求→返回现有总结,不重新生成,不扣配额

**错误码**：`QUOTA_EXCEEDED`(403), `SUMMARY_IN_PROGRESS`(409)

---

## 4. 配额管理

### 4.1 GET /api/quotas

**响应**：
```json
{
  "ok": true,
  "data": {
    "courses": { "used": 4, "limit": 6 },
    "ai": {
      "learningInteractions": { "used": 87, "limit": 150, "resetAt": "2025-02-07T00:00:00Z" },
      "documentSummary": { "used": 23, "limit": 100, "resetAt": "2025-02-07T00:00:00Z" },
      "sectionSummary": { "used": 15, "limit": 65, "resetAt": "2025-02-07T00:00:00Z" },
      "courseSummary": { "used": 3, "limit": 15, "resetAt": "2025-02-07T00:00:00Z" },
      "autoExplain": { "used": 145, "limit": 300, "resetAt": "2025-02-07T00:00:00Z" },
      "contextExtraction": { "used": 5, "limit": 20, "resetAt": "2025-02-07T00:00:00Z" }
    }
  },
  "traceId": "...",
  "timestamp": "..."
}
```

**说明**：resetAt基于用户注册日期计算(如7号注册则每月7号00:00 UTC重置)

---

## 5. 贴纸管理

### 5.1 GET /api/courses/:courseId/files/:fileId/stickers

**查询参数**：`page`(可选,筛选特定页)

**响应**：
```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "id": "sticker_1",
        "type": "auto",
        "page": 5,
        "anchor": { "textSnippet": "...", "rect": {...} },
        "parentId": null,
        "depth": 0,
        "contentMarkdown": "...",
        "folded": false,
        "currentVersion": 1,
        "createdAt": "2025-01-10T10:00:00Z"
      }
    ]
  }
}
```

### 5.2 PATCH /api/stickers/:stickerId

**请求**：`{ "folded": true }`

**响应**：`{ "ok": true, "data": { "id": "sticker_1", "folded": true } }`

**边界**：网络失败→前端乐观更新,后台重试3次,失败后回滚UI

### 5.3 DELETE /api/stickers/:stickerId

**用途**：删除贴纸及其所有追问子贴纸

**行为**：
- 删除贴纸及其所有追问子贴纸(级联删除)
- 删除贴纸的所有版本记录
- 验证贴纸所有权

**错误码**：`NOT_FOUND`(404)

---

## 6. 内部接口

### 6.1 POST /api/internal/worker/run

**用途**：触发后台Worker处理待生成任务

**认证**：`Authorization: Bearer <WORKER_SECRET>`

**响应**：
```json
{
  "ok": true,
  "data": {
    "workerId": "worker-1736598000000-abc123",
    "jobsProcessed": 5,
    "jobsFailed": 0,
    "zombiesCleaned": 0,
    "durationMs": 12500
  }
}
```

### 6.2 GET /api/admin/metrics

**用途**：获取监控指标

**认证**：`x-admin-secret`请求头

**查询参数**：
- `period`: `hour`/`day`/`week`(默认`day`)
- `include`: `metrics`/`health`/`cache`/`all`(默认`all`)

**响应**：包含cacheHitRate、successRate、latency百分位、workerHealth等

### 6.3 GET /api/admin/analytics

**用途**：获取系统分析数据

**认证**：`x-admin-secret`请求头

**查询参数**：`days`=7/30/90(默认30)

**响应**：包含overview(总用户/课程/文件等)、activeUsers、operations分布、errors分布、costTrend等

### 6.4 POST /api/internal/context-worker/run

**用途**：触发上下文提取Worker

**配置**：批处理5个任务/次,超时55秒,僵尸阈值5分钟,最大重试3次

### 6.5 POST /api/internal/context-worker/cleanup

**用途**：清理7天以上过期任务

---

## 7. 错误码

### 7.1 错误码分类

| 类别 | HTTP范围 | 说明 |
|------|----------|------|
| 认证/授权 | 401/403 | 登录、权限相关 |
| 资源操作 | 404/409 | 资源CRUD |
| 配额限制 | **403** | 配额用尽(业务限制) |
| 限流 | **429** | 请求频率超限(技术限制) |
| AI服务 | 400/503/504 | AI调用相关 |
| 系统错误 | 500/503 | 系统级故障 |

### 7.2 核心错误码清单

| 错误码 | HTTP | 含义 | 前端行为 |
|--------|------|------|----------|
| `UNAUTHORIZED` | 401 | 未登录或token失效 | 清理状态,跳转登录 |
| `FORBIDDEN` | 403 | 无权限 | 显示无权限提示 |
| `EMAIL_NOT_CONFIRMED` | 403 | 未完成邮箱验证 | 显示"重发邮件"按钮 |
| `NOT_FOUND` | 404 | 资源不存在或无权访问 | 返回上级页面 |
| `INVALID_INPUT` | 400 | 请求参数错误 | 显示字段错误 |
| `INVALID_CREDENTIALS` | 401 | 邮箱或密码错误 | 提示重新输入 |
| `EMAIL_ALREADY_EXISTS` | 409 | 邮箱已注册 | 提示登录或找回密码 |
| `DUPLICATE_COURSE_NAME` | 409 | 课程名重复 | 提示修改名称 |
| `FILE_NAME_CONFLICT` | 409 | 文件名冲突 | 弹出对话框 |
| `SUMMARY_IN_PROGRESS` | 409 | 总结生成中 | 禁用按钮 |
| `SESSION_EXISTS` | 409 | 已有活跃会话 | 提示已有进行中会话 |
| `COURSE_LIMIT_REACHED` | 403 | 课程数量达上限(6个) | 禁用新建按钮 |
| `QUOTA_EXCEEDED` | **403** | AI配额用尽 | 禁用按钮+显示配额详情 |
| `RATE_LIMIT_EXCEEDED` | **429** | 请求频率超限 | 显示`details.retryAfter`倒计时 |
| `FILE_IS_SCANNED` | 400 | PDF为扫描件 | 提示上传文字PDF |
| `MAX_DEPTH_REACHED` | 400 | 追问深度超限 | 提示已达追问深度上限 |
| `WEAK_PASSWORD` | 400 | 密码不符合复杂度 | 显示密码规则 |
| `INVALID_TOKEN` | 400 | 重置token无效 | 提示重新请求链接 |
| `AI_TIMEOUT` | 504 | AI请求超时 | 提示稍后重试,不扣配额 |
| `SERVICE_UNAVAILABLE` | 503 | 系统暂时不可用 | 稍后重试 |
| `ADMIN_UNAUTHORIZED` | 401 | 管理员密钥无效 | 清除sessionStorage |
| `WORKER_UNAUTHORIZED` | 401 | Worker密钥无效 | 内部接口,记录日志 |

**重要说明**：
- 所有429错误应显示`details.retryAfter`倒计时
- 所有403配额错误应显示具体配额桶和使用情况
- `traceId`必须显示在错误提示中,便于用户反馈

---

## 8. 健康检查

### 8.1 GET /api/health

**用途**：系统健康检查(用于负载均衡器/监控系统)

**响应(健康 - 200)**：
```json
{
  "ok": true,
  "data": {
    "status": "healthy",
    "timestamp": "2025-01-10T10:00:00Z",
    "services": {
      "database": "healthy",
      "storage": "healthy"
    }
  }
}
```

**响应(不健康 - 503)**：`data.status`为`"unhealthy"`

**说明**：无需认证,响应时间应<100ms

---

## 附录

### A. 边界情况处理

**重复请求**：
- 快速双击→前端禁用按钮
- 5秒内相同请求→返回409(需Redis,MVP可降级)
- 已有缓存数据→直接返回

**网络中断**：
- Streaming已返回首token→扣配额
- Streaming未返回首token→不扣配额
- 30秒超时→返回504,不扣配额

**状态不一致**：
- 配额显示不符→API返回最新配额
- 多标签页操作→以数据库状态为准
- 删除后访问→返回404

**并发控制**：
- 多标签页同时请求→数据库事务确保配额原子扣减
- 第二个请求返回相应错误码+最新配额
- **MVP阶段**：采用"后写入覆盖"策略,不实现乐观锁

**traceId使用**：
- 所有API响应必含
- 前端应记录到控制台日志
- 错误提示中应显示,便于用户反馈
- 格式：UUID v4,由服务端生成

---

**文档版本**：v2.2
**最后更新**：2026-01-16
**适用系统**：StudentAid MVP v2.1+
