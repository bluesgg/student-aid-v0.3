# 03 API设计

> **文档定位**：后端接口规范,定义请求/响应契约;前端实现见04。

---

## 0. 全局约束

**鉴权方式**：
* 所有`/api/*`接口需登录(除`/api/auth/*`的login/register/resend)
* httpOnly cookie会话(`sb-<project-ref>-auth-token`)
* 前端请求：`credentials: 'include'`,禁止手动传`Authorization`头

**返回格式**：统一JSON,错误结构见§6

**命名映射**：
* 数据库字段：snake_case(`user_id`,`created_at`)
* API字段：camelCase(`userId`,`createdAt`)

**配额消耗原则**(适用于所有AI接口)：
1. 成功扣除：仅当AI返回完整响应时扣除配额
2. 失败不扣：客户端超时/服务端错误/LLM不可用
3. 部分扣除：Streaming已返回首token但中途中断→仍扣除配额
4. 防滥用：相同(userId+endpoint+参数hash)在5秒内的重复请求返回409(需Redis实现,MVP可降级为无幂等)

**数据收集政策**（详见01_PRD §2.6）：
* **必须收集**：账户身份、课程结构、PDF元数据、AI学习数据、配额使用
* **建议收集**：轻量行为数据、PDF内容hash、设备与客户端状态、安全与审计数据、运行监控与成本核算、用户反馈、计费与权限预留字段
* **不收集**：真实姓名、手机号、完整IP地址、设备指纹、详细行为时间线、用户PDF内容
* **纯前端状态**：P5布局偏好(栏宽比例)存储在localStorage，不上传后端
* **隐私承诺**：所有数据仅用于产品功能、安全、排错和成本控制，不用于广告或用户画像
* **数据删除**：删除课程/文件时级联删除相关AI数据；审计日志和监控数据定期自动清理（30-90天）

---

## 1. 认证相关

### 1.1 认证架构

**会话管理**：
* Supabase JWT(access token 1h + refresh token 30d)存储在httpOnly cookie
* 通过`@supabase/ssr`自动管理cookie读写和token刷新
* 前端无需手动处理token(禁止使用localStorage/sessionStorage)

**邮箱验证流程**：
```
注册 → Supabase发邮件 → 点击邮件链接 → /auth/callback?code=xxx
  ↓                                                ↓
返回needsEmailConfirmation=true          exchangeCodeForSession
  ↓                                                ↓
前端提示"查看邮箱"                            设置cookie + 跳转/courses
```

### 1.2 POST /api/auth/register

**请求**：`{ "email": "foo@example.com", "password": "min8chars" }`

**响应**：
```json
{
  "ok": true,
  "data": {
    "user": { "id": "user_123", "email": "foo@example.com" },
    "needsEmailConfirmation": true
  }
}
```

**行为**：不自动登录,用户必须先完成邮箱验证

**错误码**：`EMAIL_ALREADY_EXISTS` (409) / `INVALID_INPUT` (400)

### 1.3 GET /auth/callback

**查询参数**：`code` (Supabase一次性确认码)

**成功**：调用`exchangeCodeForSession(code)`,设置cookie,重定向到`/courses`  
**失败**：重定向到`/login?error=verification_failed`

**注意**：验证链接有效期24小时

### 1.4 POST /api/auth/login

**请求**：`{ "email": "foo@example.com", "password": "password" }`

**响应**：
```json
{
  "ok": true,
  "data": {
    "user": { "id": "user_123", "email": "foo@example.com" }
  }
}
```

**错误码**：

| 错误码 | HTTP | 说明 |
|--------|------|------|
| `INVALID_CREDENTIALS` | 401 | 邮箱或密码错误 |
| `EMAIL_NOT_CONFIRMED` | 403 | 未完成邮箱验证 |

### 1.5 POST /api/auth/resend-confirmation

**请求**：`{ "email": "foo@example.com" }`

**响应**：`{ "ok": true, "data": { "message": "Confirmation email has been resent." } }`

**限流规则**（需Redis实现,MVP可降级为简单计数器）：

| 维度 | 粒度 | 限制 |
|------|------|------|
| 按邮箱 | (email) | 5次/15分钟 |
| 按IP | (clientIP) | 10次/小时 |

**触发限流时的错误响应**：
```json
{
  "ok": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again in 8 minutes.",
    "details": {
      "retryAfter": 480,
      "limitType": "email"
    }
  }
}
```

### 1.6 GET /api/auth/me

**响应**：
```json
{
  "ok": true,
  "data": {
    "id": "user_123",
    "email": "foo@example.com",
    "createdAt": "2025-01-01T12:00:00Z"
  }
}
```

**错误码**：`UNAUTHORIZED` (401)

### 1.7 POST /api/auth/logout

**响应**：`{ "ok": true }`

**行为**：服务端清理cookie

---

## 2. 课程与资料

### 2.1 GET /api/courses

**响应**：
```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "id": "course_1",
        "name": "Calculus I",
        "school": "ABC University",
        "term": "Spring 2025",
        "fileCount": 12,
        "lastVisitedAt": "2025-03-10T10:00:00Z",
        "createdAt": "2025-01-05T09:00:00Z"
      }
    ]
  }
}
```

### 2.2 POST /api/courses

**请求**：`{ "name": "Calculus I", "school": "ABC Univ", "term": "Spring 2025" }`

**规则**：
* 同用户下课程名需唯一
* 创建前检查课程数量配额(见§4)

**错误码**：`COURSE_LIMIT_REACHED` (403) / `DUPLICATE_COURSE_NAME` (409)

### 2.3 PATCH /api/courses/:courseId

**请求**：`{ "name"?: "Calculus II", "school"?: "ABC University", "term"?: "Fall 2025" }`

**错误码**：`NOT_FOUND` (404) / `DUPLICATE_COURSE_NAME` (409) / `FORBIDDEN` (403)

### 2.4 DELETE /api/courses/:courseId

**行为**：删除课程及其下所有文件与AI数据(级联删除,需数据库ON DELETE CASCADE配置)

**响应**：
```json
{
  "ok": true,
  "data": {
    "message": "Course and all related data deleted successfully.",
    "deletedFileCount": 5
  }
}
```

### 2.5 GET /api/courses/:courseId

**响应**：
```json
{
  "ok": true,
  "data": {
    "id": "course_1",
    "name": "Calculus I",
    "school": "ABC University",
    "term": "Spring 2025",
    "createdAt": "2025-01-05T09:00:00Z",
    "files": [
      {
        "id": "file_1",
        "name": "Week1_Lecture.pdf",
        "type": "Lecture",
        "pageCount": 25,
        "isScanned": false,
        "uploadedAt": "2025-01-06T10:00:00Z",
        "lastReadPage": 10
      }
    ]
  }
}
```

### 2.6 GET /api/courses/:courseId/files/:fileId

**响应**：
```json
{
  "ok": true,
  "data": {
    "id": "file_1",
    "courseId": "course_1",
    "name": "Week1_Lecture.pdf",
    "type": "Lecture",
    "pageCount": 25,
    "isScanned": false,
    "uploadedAt": "2025-01-06T10:00:00Z",
    "lastReadPage": 10,
    "pdfUrl": "https://xxx.supabase.co/storage/v1/object/public/pdfs/user_123/course_1/file_1.pdf"
  }
}
```

### 2.7 POST /api/courses/:courseId/files

**请求**：multipart/form-data
* `file`: PDF文件
* `type`: "Lecture" | "Homework" | "Exam" | "Other"
* `name`: 可选,不提供则使用原文件名

**处理流程**：
1. 检查文件名是否冲突(同课程下文件名不可重复)
2. 上传到Supabase Storage
3. 调用`detectScannedPdf()`检测是否扫描件(算法见04_TECH §2.3)
4. 提取页数`pageCount`
5. 创建数据库记录

**响应**：
```json
{
  "ok": true,
  "data": {
    "id": "file_1",
    "name": "Week1_Lecture.pdf",
    "type": "Lecture",
    "pageCount": 25,
    "isScanned": false,
    "uploadedAt": "2025-01-06T10:00:00Z"
  }
}
```

**错误码**：
* `FILE_NAME_CONFLICT` (409) - 文件名冲突,前端弹出对话框(重命名/替换/取消)
* `INVALID_FILE_TYPE` (400) - 非PDF文件
* `FILE_TOO_LARGE` (413) - 文件超过限制(建议50MB)

### 2.8 DELETE /api/courses/:courseId/files/:fileId

**行为**：删除文件及其所有AI数据(贴纸/总结,级联删除)

**响应**：`{ "ok": true }`

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
    textSnippet: string         // 原文片段(前后各50字)
    rect?: {                    // 可选,PDF坐标
      x: number
      y: number
      width: number
      height: number
    }
  }
  parentId: string | null       // 追问链父贴纸ID
  contentMarkdown: string       // AI生成内容(Markdown格式)
  folded: boolean               // 折叠状态
  createdAt: string             // ISO 8601
}
```

### 3.0.2 配额桶枚举

配额数值定义见01_PRD §3.1

| 配额桶 | 粒度 | 包含操作 | 默认限制 |
|--------|------|---------|---------|
| learningInteractions | (userId) | 选中讲解 + 问答 | 150次/账户 |
| documentSummary | (userId) | 文档总结 | 100次/账户 |
| sectionSummary | (userId) | 章节总结 | 65次/账户 |
| courseSummary | (userId) | 课程级提纲 | 15次/账户 |
| autoExplain | (userId,date_UTC) | 自动讲解 | 300次/天 |

### 3.0.3 AI文本格式规范

所有AI接口返回的`contentMarkdown`字段遵循以下规范：

**Markdown语法**：
* 标题：`# H1`, `## H2`, `### H3`
* 粗体/斜体：`**bold**`, `*italic*`
* 列表：`- item`, `1. item`
* 表格：标准Markdown表格
* 引用：`> quote`

**LaTeX公式**：
* 行内公式：`$E = mc^2$`
* 块级公式：`$$\int_0^1 x^2 dx$$`

**代码块**：
````markdown
```python
def hello():
    print("Hello")
```
````

**约束**：
* 后端不返回HTML
* 前端使用`MarkdownRenderer`组件统一渲染(见04_TECH §11)

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

**新增参数**：
* `locale`: 语言设置，可选值 `"en"` | `"zh-Hans"`，默认 `"en"`

**限流规则**：300次/账户/月,按注册日期周期重置(例如9月7号注册,则每月7号00:00 UTC重置;需Cron Job实现,见04_TECH §13.1)

**缓存检查（v2.0 跨用户共享缓存）**：
1. 检查用户私有缓存：(userId,fileId,page)的自动贴纸
2. 检查共享缓存：(pdfHash,page,promptVersion,locale,effectiveMode)
3. 有则直接返回200,不重新生成,不扣配额
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
          "rect": { "x": 100, "y": 200, "width": 300, "height": 50 }
        },
        "contentMarkdown": "## 微分定义\n\n微分描述的是...",
        "folded": false,
        "createdAt": "2025-01-10T10:00:00Z"
      }
    ],
    "quota": {
      "autoExplain": { "used": 146, "limit": 300, "resetAt": "2025-02-07T00:00:00Z" }
    },
    "cached": true,
    "source": "shared_cache"
  }
}
```

**响应（异步生成中 - HTTP 202）**：
```json
{
  "ok": true,
  "status": "generating",
  "generationId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Sticker generation in progress. Poll /api/ai/explain-page/status/:generationId for updates.",
  "pollInterval": 2000
}
```

**错误码**：
* `QUOTA_EXCEEDED` (429) - 月度配额已用尽
* `FILE_IS_SCANNED` (400) - 扫描件不支持AI讲解

### 3.3.1 GET /api/ai/explain-page/status/:generationId

**轮询端点**：客户端收到202响应后,每2秒调用此端点检查生成状态

**响应（生成中）**：
```json
{
  "ok": true,
  "data": {
    "status": "generating",
    "generationId": "550e8400-e29b-41d4-a716-446655440000",
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
    "generationId": "550e8400-e29b-41d4-a716-446655440000",
    "stickers": [...],
    "generationTimeMs": 3500,
    "message": "Stickers are ready"
  }
}
```

**响应（失败）**：
```json
{
  "ok": true,
  "data": {
    "status": "failed",
    "generationId": "550e8400-e29b-41d4-a716-446655440000",
    "error": "AI generation failed",
    "message": "Sticker generation failed. Quota has been refunded."
  }
}
```

### 3.4 POST /api/ai/explain-selection

**请求**：
```json
{
  "courseId": "course_1",
  "fileId": "file_1",
  "page": 5,
  "selectedText": "微分的定义是...",
  "parentId": null,
  "pdfType": "Lecture"
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
      "anchor": {
        "textSnippet": "微分的定义是...",
        "rect": { "x": 100, "y": 200, "width": 300, "height": 50 }
      },
      "parentId": null,
      "contentMarkdown": "## 微分详解\n\n...",
      "folded": false,
      "createdAt": "2025-01-10T10:05:00Z"
    },
    "quota": {
      "learningInteractions": { "used": 88, "limit": 150 }
    }
  }
}
```

**错误码**：
* `QUOTA_EXCEEDED` (429) - learningInteractions配额用尽
* `MAX_DEPTH_REACHED` (400) - 追问链深度超过10层

### 3.5 POST /api/ai/qa

**请求**：
```json
{
  "courseId": "course_1",
  "fileId": "file_1",
  "question": "What is the main difference between differentiation and integration?"
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
      "learningInteractions": { "used": 89, "limit": 150 }
    }
  }
}
```

### 3.6 POST /api/ai/summarize

**请求**：
```json
{
  "courseId": "course_1",
  "fileId": "file_1",
  "type": "document" | "section" | "course",
  "pageRange"?: { "start": 1, "end": 10 }
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
      "documentSummary": { "used": 24, "limit": 100 }
    }
  }
}
```

**边界情况**：
* 总结生成中再次请求→返回409 + `SUMMARY_IN_PROGRESS`
* 已有总结再次请求→返回现有总结,不重新生成,不扣配额

**错误码**：
* `QUOTA_EXCEEDED` (429) - 对应配额桶用尽
* `SUMMARY_IN_PROGRESS` (409) - 总结正在生成中

---

## 4. 配额管理

### 4.1 GET /api/quotas

**响应**（账户全局配额）：
```json
{
  "ok": true,
  "data": {
    "courses": { "used": 4, "limit": 6 },
    "ai": {
      "learningInteractions": { "used": 87, "limit": 150, "resetAt": "2025-02-07T00:00:00Z" },
      "documentSummary": { "used": 23, "limit": 100, "resetAt": "2025-02-07T00:00:00Z" },
      "sectionSummary": { "used": 15, "limit": 65, "resetAt": "2025-02-07T00:00:00Z" },
      "courseSummary": { "used": 3, "limit": 15, "resetAt": "2025-02-07T00:00:00Z" }
    },
    "autoExplain": {
      "used": 145,
      "limit": 300,
      "resetAt": "2025-02-07T00:00:00Z"  // 根据用户注册日期(9/7)计算
    }
  }
}
```

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
        "contentMarkdown": "...",
        "folded": false,
        "createdAt": "2025-01-10T10:00:00Z"
      }
    ]
  }
}
```

### 5.2 PATCH /api/stickers/:stickerId

**请求**：`{ "folded": true }`

**响应**：`{ "ok": true, "data": { "id": "sticker_1", "folded": true } }`

**边界情况**：
* 网络失败→前端乐观更新,后台重试3次,失败后回滚UI并显示"保存失败"

---

## 6. 内部/管理员接口

### 6.1 POST /api/internal/worker/run

**用途**：触发后台 Worker 处理待生成的 Sticker 任务

**认证**：需要 `WORKER_SECRET` 或 `CRON_SECRET` 环境变量

**请求头**：
```
Authorization: Bearer <WORKER_SECRET>
```

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

**用途**：获取 Sticker 生成系统的监控指标

**认证**：需要 `x-admin-secret` 请求头

**查询参数**：
* `period`: `"hour"` | `"day"` | `"week"`（默认 `"day"`）
* `include`: 逗号分隔的区段列表，可选值：`"metrics"`, `"health"`, `"cache"`, `"all"`（默认 `"all"`）

**请求示例**：
```bash
curl https://your-app.com/api/admin/metrics \
  -H "x-admin-secret: $ADMIN_SECRET" \
  -G -d "period=day" -d "include=all"
```

**响应**：
```json
{
  "ok": true,
  "data": {
    "metrics": {
      "period": "day",
      "startTime": "2026-01-10T00:00:00Z",
      "endTime": "2026-01-11T00:00:00Z",
      "cacheHits": 150,
      "cacheMisses": 50,
      "cacheHitRate": 0.75,
      "totalGenerations": 50,
      "successfulGenerations": 49,
      "failedGenerations": 1,
      "successRate": 0.98,
      "avgLatencyMs": 2500,
      "p50LatencyMs": 2000,
      "p95LatencyMs": 5000,
      "p99LatencyMs": 8000,
      "totalJobsProcessed": 50,
      "avgRetries": 0.1,
      "uniquePdfHashes": 30,
      "sharedCacheEntries": 120
    },
    "workerHealth": {
      "isHealthy": true,
      "lastRunAt": "2026-01-11T10:00:00Z",
      "pendingJobs": 3,
      "stuckJobs": 0,
      "avgJobDuration": 3500
    },
    "cacheEfficiency": {
      "totalCanonicalDocs": 150,
      "totalSharedStickers": 450,
      "avgReferencesPerDoc": 2.5,
      "estimatedCostSavings": 3.75,
      "topSharedDocs": [
        {
          "pdfHash": "abc123...",
          "referenceCount": 10,
          "totalStickers": 25
        }
      ]
    }
  }
}
```

---

## 7. 统一错误码清单

| 错误码 | HTTP | 含义 | 前端行为 |
|--------|------|------|---------|
| `UNAUTHORIZED` | 401 | 未登录或token过期 | 清理状态+跳转/login |
| `FORBIDDEN` | 403 | 无权限访问资源 | 显示"无权限" |
| `EMAIL_NOT_CONFIRMED` | 403 | 邮箱未验证 | 显示"重发邮件"按钮 |
| `NOT_FOUND` | 404 | 资源不存在 | 显示"Not found" |
| `INVALID_INPUT` | 400 | 请求参数错误 | 显示具体错误信息 |
| `INVALID_CREDENTIALS` | 401 | 邮箱或密码错误 | 提示"Invalid email or password" |
| `EMAIL_ALREADY_EXISTS` | 409 | 邮箱已注册 | 提示"邮箱已存在" |
| `DUPLICATE_COURSE_NAME` | 409 | 课程名重复 | 提示修改名称 |
| `FILE_NAME_CONFLICT` | 409 | 文件名冲突 | 弹出对话框(重命名/替换/取消) |
| `SUMMARY_IN_PROGRESS` | 409 | 总结生成中 | 显示"正在生成"并禁用按钮 |
| `INVALID_FILE_TYPE` | 400 | 非PDF文件 | 提示"仅支持PDF" |
| `FILE_TOO_LARGE` | 413 | 文件过大 | 提示"文件不能超过50MB" |
| `FILE_IS_SCANNED` | 400 | 扫描件不支持AI | 显示"扫描件不支持AI讲解" |
| `MAX_DEPTH_REACHED` | 400 | 追问链深度超限 | 提示"已达追问深度上限" |
| `COURSE_LIMIT_REACHED` | 403 | 课程数量达上限 | 禁用"新建课程"按钮 |
| `QUOTA_EXCEEDED` | 429 | 配额用尽 | 禁用按钮+显示剩余配额 |
| `AUTO_EXPLAIN_LIMIT_REACHED` | 429 | 自动讲解限流 | 仅禁用"Explain this page"按钮 |
| `RATE_LIMIT_EXCEEDED` | 429 | 请求频率超限 | 显示"请求过于频繁,请稍后重试" |
| `AI_TIMEOUT` | 504 | AI请求超时 | 提示"请求超时,请稍后重试",不扣配额 |
| `AI_SERVICE_UNAVAILABLE` | 503 | OpenAI不可用 | 提示"AI服务暂时不可用",不扣配额 |
| `SERVICE_UNAVAILABLE` | 503 | Supabase不可用 | 提示"服务暂时不可用,请稍后重试" |

**错误响应格式**：
```json
{
  "ok": false,
  "error": {
    "code": "QUOTA_EXCEEDED",
    "message": "AI quota exceeded",
    "details": {
      "bucket": "learningInteractions",
      "used": 150,
      "limit": 150
    }
  }
}
```

---

## 附录：边界情况处理

### A1. 重复请求
* 快速双击→前端禁用按钮直到响应返回
* 5秒内相同请求→返回409(需Redis,MVP可降级)
* 已有缓存数据→直接返回,不重新生成

### A2. 网络中断
* Streaming已返回首token→扣配额
* Streaming未返回首token→不扣配额
* 30秒超时→返回504,不扣配额

### A3. 状态不一致
* 配额显示不符→API返回最新配额,前端更新
* 多标签页操作→以数据库状态为准
* 删除后访问→返回404

### A4. 并发控制
* 多标签页同时请求→数据库事务确保配额原子扣减
* 第二个请求返回429 + 最新配额
