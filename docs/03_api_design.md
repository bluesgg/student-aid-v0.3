# 03 API设计(精简版)

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
3. 部分扣除：Streaming已开始但中途中断→仍扣除配额
4. 防滥用：同一请求(相同`sessionId`+参数)在1分钟内重试不扣除额外配额

**数据收集政策**：
* **必须收集**：账户身份、课程结构、PDF元数据、AI学习数据、配额使用（详见01_PRD §2.6）
* **建议收集**：轻量行为数据、PDF内容hash、设备与客户端状态、安全与审计数据、运行监控与成本核算、用户反馈、计费与权限预留字段
* **不收集**：真实姓名、手机号、完整IP地址、设备指纹、详细行为时间线、用户PDF内容
* **隐私承诺**：所有数据仅用于产品功能、安全、排错和成本控制，不用于广告或用户画像
* **数据删除**：删除课程/文件时级联删除相关AI数据；审计日志和监控数据定期自动清理（30-90天）

---

## 1. 认证相关

### 1.1 认证架构

**会话管理**：
* Supabase JWT(access token 1h + refresh token 7d)存储在httpOnly cookie
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

**成功**：自动设置cookie,重定向到`/courses`  
**失败**：重定向到`/login?error=verification_failed`

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

**限流规则**：

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

**行为**：删除课程及其下所有文件与AI数据(级联删除)

**响应**：
```json
{
  "ok": true,
  "data": {
    "message": "Course deleted successfully",
    "deletedCourseId": "course_1",
    "deletedFilesCount": 12,
    "deletedStickersCount": 87
  }
}
```

**级联删除说明**：
* 自动删除课程下的所有文件
* 自动删除所有相关的贴纸、总结数据
* 释放课程数量配额(6门→5门)
* 使用数据库`ON DELETE CASCADE`确保数据一致性

### 2.5 GET /api/courses/:courseId

**响应**：
```json
{
  "ok": true,
  "data": {
    "id": "course_1",
    "name": "Calculus I",
    "fileCount": 12,
    "createdAt": "2025-01-05T09:00:00Z"
  }
}
```

### 2.6 GET /api/courses/:courseId/files

**响应**：
```json
{
  "ok": true,
  "data": {
    "files": [
      {
        "id": "file_1",
        "name": "Week1_Lecture.pdf",
        "type": "Lecture",
        "pageCount": 25,
        "isScanned": false,
        "lastReadPage": 3,
        "uploadedAt": "2025-01-20T08:00:00Z"
      }
    ]
  }
}
```

**字段说明**：
* `type`: `"Lecture" | "Homework" | "Exam" | "Other"`
* `isScanned`: 是否缺乏文本层(扫描件)
* `lastReadPage`: 用户上次阅读到的页码(默认1)

### 2.7 POST /api/courses/:courseId/files

**请求格式**：`multipart/form-data`
* `files[]`: PDF文件(支持多文件)
* `types[]`: 对应类型

**规则**：
* 仅支持PDF格式
* 同课程下文件名不可重复
* 自动提取：页数`pageCount`、文本可用性`isScanned`

**文件名冲突处理**：
```json
{
  "ok": false,
  "error": {
    "code": "FILE_NAME_CONFLICT",
    "message": "A file with this name already exists in this course.",
    "details": {
      "fileName": "Week1_Lecture.pdf",
      "existingFile": {
        "id": "file_123",
        "uploadedAt": "2025-01-20T08:00:00Z",
        "pageCount": 25
      },
      "suggestedName": "Week1_Lecture (1).pdf"
    }
  }
}
```

**前端行为选项**：
* 自动重命名：使用`suggestedName`重新上传
* 替换原文件：调用`DELETE /api/files/:fileId`删除原文件后重新上传(会删除所有相关AI数据)
* 取消上传

**多文件上传部分失败**：
```json
{
  "ok": true,
  "data": {
    "succeeded": [
      { "id": "file_1", "name": "Week2_Lecture.pdf" }
    ],
    "failed": [
      {
        "fileName": "Week1_Lecture.pdf",
        "error": { "code": "FILE_NAME_CONFLICT", "message": "...", "details": {...} }
      },
      {
        "fileName": "scan.doc",
        "error": { "code": "UNSUPPORTED_FILE_TYPE", "message": "..." }
      }
    ]
  }
}
```

### 2.8 PATCH /api/files/:fileId

**请求**(全部可选)：`{ "name"?: "Week2_Lecture.pdf", "type"?: "Lecture", "lastReadPage"?: 5 }`

**注意**：
* 修改文件类型会标记课程级总结缓存为"陈旧"
* `lastReadPage`更新频繁,建议前端使用防抖(如每5秒更新一次)

**错误码**：`NOT_FOUND` (404) / `FORBIDDEN` (403) / `FILE_NAME_CONFLICT` (409) / `INVALID_INPUT` (400)

### 2.9 DELETE /api/files/:fileId

**行为**：删除文件及相关AI数据(贴纸、总结)

**级联删除说明**：
* 自动删除该文件的所有贴纸(自动+手动)
* 自动删除文档/章节总结
* 标记课程级总结缓存为"陈旧"
* PDF文件从Storage中删除

### 2.10 GET /api/files/:fileId/content

**功能**：获取PDF文件内容用于前端渲染

**响应**(200)：
* **Content-Type**: `application/pdf`
* **Content-Disposition**: `inline; filename="<original-filename>.pdf"`
* **Body**: PDF二进制流

**错误码**：`NOT_FOUND` (404) / `FORBIDDEN` (403) / `SERVICE_UNAVAILABLE` (503)

---

## 3. 学习与AI功能

### 3.0 通用约定

#### 3.0.1 贴纸数据模型

```json
{
  "id": "sticker_123",
  "userId": "user_1",
  "courseId": "course_1",
  "fileId": "file_9",
  "type": "auto" | "manual",
  "source": "pdf" | "sticker",
  "page": 12,
  "anchor": {
    "textSnippet": "Definition: A sequence {a_n} ...",
    "rect": { "x": 0.15, "y": 0.32, "width": 0.7, "height": 0.08 }
  },
  "parentId": null,
  "order": 3150,
  "contentMarkdown": "### Main idea\n...",
  "folded": false,
  "createdAt": "2025-01-20T10:00:00Z"
}
```

**字段说明**：
* `type: "auto"`: 通过"Explain this page"生成
* `type: "manual"`: 从PDF或贴纸选中文本触发
* `source: "pdf"`: 原始选区来自PDF
* `source: "sticker"`: 来自某条贴纸(追问链)
* `anchor.rect`: 相对位置(0-1范围),用于左右联动
* `parentId`: 追问链指向,顶层贴纸为`null`
* `order`: 排序字段,计算规则：`order = page * 10000 + Math.floor(anchor.rect.y * 1000)`

**追问链深度限制**：最大深度3层(根贴纸→追问1→追问2);触达限制后,前端禁用"AI讲解"按钮并提示

#### 3.0.2 配额桶枚举

| 配额桶 | 包含操作 | 默认限制 | 粒度 |
|--------|---------|---------|------|
| `learningInteractions` | 选中讲解(PDF/贴纸) + 问答 | 150次/账户 | (userId) |
| `documentSummary` | 文档总结 | 100次/账户 | (userId) |
| `sectionSummary` | 章节总结 | 65次/账户 | (userId) |
| `courseSummary` | 课程级提纲 | 15次/账户 | (userId) |
| *(内部限流)* `autoExplain` | 自动讲解 | 300次/账户/天 | (userId,date) |

**注意**：
* 所有配额按账户全局计数,不区分课程
* 自动讲解不占用户可见配额,仅通过`rateLimit`字段返回
* 删除课程不影响配额(配额属于账户)

#### 3.0.3 AI文本格式约定

所有AI输出字段(`contentMarkdown`,`rawMarkdown`,`answer.text`)为**Markdown字符串**：
* Markdown：标题/粗体/列表/表格/引用等完整语法
* LaTeX：行内`$...$`或`\(...\)`,块级`$$...$$`或`\[...\]`
* 代码：` ```python`等,行内单反引号
* 约束：后端不返回HTML,前端用`MarkdownRenderer`统一渲染

### 3.1 GET /api/files/:fileId/stickers

**查询参数**(可选)：
* `page`: 仅返回该页贴纸
* `pageFrom` + `pageTo`: 页区间
* `includeThreads`: 是否包含追问链(默认true)

**响应**：
```json
{
  "ok": true,
  "data": {
    "fileId": "file_1",
    "stickers": [ /* 见§3.0.1结构 */ ]
  }
}
```

**排序**：按`page`升序→`order`升序

### 3.2 PATCH /api/stickers/:stickerId

**请求**(全部可选)：`{ "folded"?: boolean, "order"?: number, "anchor"?: {...} }`

**约束**：
* 不允许修改`type`,`source`,`contentMarkdown`
* MVP不提供删除接口
* 仅允许当前用户操作自己课程下的贴纸

### 3.3 POST /api/ai/explain-page

**功能**：对当前页生成自动讲解贴纸(`type="auto"`)

**请求**：
```json
{
  "courseId": "course_1",
  "fileId": "file_1",
  "page": 3,
  "pageRange"?: { "from": 3, "to": 4 },
  "sessionId"?: "session_abc"
}
```

**响应**：
```json
{
  "ok": true,
  "data": {
    "stickers": [ /* 见§3.0.1,type="auto" */ ],
    "reference": {
      "fileId": "file_1",
      "pageRange": { "from": 3, "to": 3 }
    },
    "rateLimit": {
      "dimension": "per_file_daily",
      "usedToday": 5,
      "limit": 20,
      "remaining": 15,
      "resetAt": "2025-01-21T00:00:00Z"
    }
  }
}
```

**限流规则**：

| 维度 | 粒度 | 限制 | 重置 |
|------|------|------|------|
| 按账户每日 | (userId,date_UTC) | 300次/天 | 00:00 UTC |
| 单次请求 | - | 最多6条贴纸 | - |

**计数规则**：
* 每次成功调用计1次(无论生成几条贴纸)
* 若页面已有自动贴纸缓存,不重复调用,也不计数
* 失败请求不计数

**配额说明**：不计入`learningInteractions`等用户可见配额,仅通过`rateLimit`字段透传给前端

**错误码**：

| 错误码 | HTTP | 前端行为 |
|--------|------|---------|
| `AUTO_EXPLAIN_LIMIT_REACHED` | 429 | 显示倒计时:"今日自动讲解已用完(300/300),将在X小时后重置" |
| `PAGE_RANGE_TOO_LARGE` | 400 | 提示缩小范围 |
| `SCANNED_PDF_UNSUPPORTED` | 422 | "该PDF为扫描件,暂不支持自动讲解" |

### 3.4 POST /api/ai/explain-selection

**功能**：对选中文本生成手动讲解贴纸(`type="manual"`)

**请求**：
```json
{
  "courseId": "course_1",
  "fileId": "file_1",
  "page": 10,
  "sourceType": "pdf" | "sticker",
  "sourceStickerId"?: "sticker_5",
  "selectionText": "We define the derivative at a point ...",
  "selectionContext"?: "...前后若干句...",
  "anchor"?: {
    "textSnippet": "...",
    "rect": { "x": 0.15, "y": 0.4, "width": 0.7, "height": 0.1 }
  },
  "sessionId"?: "session_abc"
}
```

**行为**：
* `sourceType="pdf"`: `parentId=null`,插入到对应页面位置
* `sourceType="sticker"`: `parentId=sourceStickerId`,紧挨父贴纸

**响应**：
```json
{
  "ok": true,
  "data": {
    "sticker": { /* 见§3.0.1,type="manual" */ },
    "quota": {
      "bucket": "learningInteractions",
      "used": 87,
      "limit": 150,
      "remaining": 63
    }
  }
}
```

**配额**：计入`learningInteractions`(包括PDF和贴纸来源)

**错误码**：`QUOTA_EXCEEDED` (429) / `SCANNED_PDF_UNSUPPORTED` (422) / `NOT_FOUND` (404)

### 3.5 POST /api/ai/qa

**功能**：基于当前PDF的问答

**请求**：
```json
{
  "courseId": "course_1",
  "fileId": "file_1",
  "question": "这章几个定理的关系是什么?",
  "pageHint"?: 5,
  "sessionId"?: "session_abc"
}
```

**响应**：
```json
{
  "ok": true,
  "data": {
    "answer": {
      "text": "In this section, the limit definition ...",
      "rawMarkdown": "### Answer\n...",
      "relatedPages": [3, 4, 10],
      "citations": [
        { "fileId": "file_1", "page": 3, "snippet": "Definition 1.1 ..." }
      ]
    },
    "quota": {
      "bucket": "learningInteractions",
      "used": 95,
      "limit": 150,
      "remaining": 55
    }
  }
}
```

**规则**：
* 仅基于当前fileId所在PDF,不跨课程/不跨PDF
* 可利用已有贴纸作为辅助上下文
* `citations`可用于前端展示页码并跳转

**配额**：计入`learningInteractions`

### 3.6 POST /api/ai/summarize-document

**功能**：对单个PDF生成整体总结

**请求**：`{ "courseId": "course_1", "fileId": "file_1", "maxSections"?: 10 }`

**响应**：
```json
{
  "ok": true,
  "data": {
    "summary": {
      "outline": [
        {
          "title": "Chapter 1: Limits and Continuity",
          "keyConcepts": ["Definition of limit", "One-sided limits"],
          "keyFormulas": ["$\\lim_{x\\to a} f(x) = L$"]
        }
      ],
      "rawMarkdown": "# Document summary\n## Chapter 1: ...",
      "reference": { "fileId": "file_1" }
    },
    "quota": {
      "bucket": "documentSummary",
      "used": 23,
      "limit": 100,
      "remaining": 77
    }
  }
}
```

**配额**：计入`documentSummary`

### 3.7 POST /api/ai/summarize-section

**功能**：对页区间生成章节总结

**请求**：`{ "courseId": "course_1", "fileId": "file_1", "pageRange": { "from": 5, "to": 8 } }`

**响应结构**：与3.6类似,配额计入`sectionSummary`

### 3.8 POST /api/ai/summarize-course

**功能**：对整门课程生成提纲

**请求**：`{ "courseId": "course_1", "fileIds"?: ["file_1", "file_2"] }`

**响应结构**：与3.6类似,配额计入`courseSummary`

---

## 4. 配额管理

### 4.1 GET /api/quotas

**响应**：
```json
{
  "ok": true,
  "data": {
    "courses": {
      "used": 4,
      "limit": 6,
      "remaining": 2
    },
    "ai": {
      "learningInteractions": { "used": 87, "limit": 150, "remaining": 63 },
      "documentSummary": { "used": 23, "limit": 100, "remaining": 77 },
      "sectionSummary": { "used": 15, "limit": 65, "remaining": 50 },
      "courseSummary": { "used": 3, "limit": 15, "remaining": 12 }
    },
    "autoExplain": {
      "usedToday": 145,
      "limit": 300,
      "remaining": 155,
      "resetAt": "2025-01-21T00:00:00Z"
    }
  }
}
```

**说明**：
* 所有AI配额为账户全局,不区分课程
* `autoExplain`为每日限流,每日00:00 UTC重置

### 4.2 GET /api/quotas/summary (简化版)

**响应**：
```json
{
  "ok": true,
  "data": {
    "learningInteractions": { "used": 87, "limit": 150, "remaining": 63 },
    "autoExplainToday": { "used": 145, "limit": 300, "remaining": 155 }
  }
}
```

**用途**：用于P4页面快速预览

---

## 5. 错误响应格式

**统一错误结构**：
```json
{
  "ok": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details"?: { /* 可选,额外上下文 */ }
  }
}
```

**典型错误码**：

| 错误码 | HTTP | 说明 |
|--------|------|------|
| `UNAUTHORIZED` | 401 | 未登录或会话过期 |
| `FORBIDDEN` | 403 | 无权访问该资源 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `DUPLICATE_COURSE_NAME` | 409 | 课程名重复 |
| `FILE_NAME_CONFLICT` | 409 | 文件名冲突 |
| `UNSUPPORTED_FILE_TYPE` | 415 | 不支持的文件类型 |
| `SCANNED_PDF_UNSUPPORTED` | 422 | 扫描件PDF不支持AI功能 |
| `QUOTA_EXCEEDED` | 429 | 配额用尽 |
| `AUTO_EXPLAIN_LIMIT_REACHED` | 429 | 自动讲解限流 |
| `RATE_LIMIT_EXCEEDED` | 429 | 请求频率超限 |
| `INVALID_INPUT` | 400 | 输入参数错误 |
| `SERVICE_UNAVAILABLE` | 503 | 服务暂时不可用 |
