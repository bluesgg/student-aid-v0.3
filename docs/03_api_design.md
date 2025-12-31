# 03 API设计（精简版）

> **文档定位**：后端接口规范，定义请求/响应契约；前端实现见04。
> **全局约束**：
> - 所有`/api/*`接口需登录（除`/api/auth/*`的login/register/resend）
> - 鉴权方式：httpOnly cookie会话（`sb-<project-ref>-auth-token`）
> - 前端请求：`credentials: 'include'`，**禁止**手动传`Authorization`头
> - 返回格式：统一JSON，错误结构见§6

---

## 1. 认证相关

### 1.1 认证架构

**会话管理**：
* Supabase JWT (access token 1h + refresh token 7d) 存储在httpOnly cookie
* 通过`@supabase/ssr`自动管理cookie读写和token刷新
* 前端无需手动处理token（**禁止**使用localStorage/sessionStorage）

**邮箱验证流程**：
```
注册 → Supabase发邮件 → 点击邮件链接 → /auth/callback?code=xxx
  ↓                                                ↓
返回needsEmailConfirmation=true          exchangeCodeForSession
  ↓                                                ↓
前端提示"查看邮箱"                            设置cookie + 跳转/courses
```

**Supabase Dashboard配置**：
* Email Templates → Confirm signup：`{{ .ConfirmationURL }}` → `https://yourdomain.com/auth/callback`
* URL Configuration → Redirect URLs：添加`https://yourdomain.com/auth/callback`

---

### 1.2 POST /api/auth/register

**请求**：
```json
{
  "email": "foo@example.com",
  "password": "min8chars"
}
```

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

**行为**：不自动登录，用户必须先完成邮箱验证

**错误码**：
* `EMAIL_ALREADY_EXISTS` (409)
* `INVALID_INPUT` (400)

---

### 1.3 GET /auth/callback

> **注意**：路径为`/auth/callback`（不是`/api/auth/callback`）

**查询参数**：`code` (Supabase一次性确认码)

**行为**：
```typescript
// app/auth/callback/route.ts
const code = searchParams.get('code')
if (code) {
  await supabase.auth.exchangeCodeForSession(code)
  return NextResponse.redirect('/courses')
}
return NextResponse.redirect('/login?error=verification_failed')
```

**成功**：自动设置cookie，重定向到`/courses`
**失败**：重定向到`/login?error=verification_failed`

---

### 1.4 POST /api/auth/login

**请求**：
```json
{
  "email": "foo@example.com",
  "password": "password"
}
```

**响应**：
```json
{
  "ok": true,
  "data": {
    "user": { "id": "user_123", "email": "foo@example.com" }
  }
}
```

**会话管理**：成功后Supabase自动设置httpOnly cookie

**错误码**：

| 错误码 | HTTP | 说明 | 前端行为 |
|--------|------|------|---------|
| `INVALID_CREDENTIALS` | 401 | 邮箱或密码错误 | 提示检查凭证 |
| `EMAIL_NOT_CONFIRMED` | 403 | 未完成邮箱验证 | 显示"重发邮件"按钮 |

**错误响应示例**：
```json
{
  "ok": false,
  "error": {
    "code": "EMAIL_NOT_CONFIRMED",
    "message": "Please verify your email before signing in.",
    "details": { "email": "foo@example.com" }
  }
}
```

---

### 1.5 POST /api/auth/resend-confirmation

**请求**：`{ "email": "foo@example.com" }`

**响应**：`{ "ok": true, "data": { "message": "Confirmation email has been resent." } }`

**错误码**：
* `NOT_FOUND` (404): 邮箱未注册
* `ALREADY_CONFIRMED` (400): 已完成验证
* `RATE_LIMIT_EXCEEDED` (429): 请求过频

---

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

**错误码**：`UNAUTHORIZED` (401) → 前端清理状态 + 跳转登录

---

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

---

### 2.2 POST /api/courses

**请求**：`{ "name": "Calculus I", "school": "ABC Univ", "term": "Spring 2025" }`

**响应**：
```json
{
  "ok": true,
  "data": {
    "id": "course_1",
    "name": "Calculus I",
    "createdAt": "2025-01-05T09:00:00Z"
  }
}
```

**规则**：
* 同用户下课程名需唯一
* 创建前检查课程数量配额（见§4）

**错误码**：
* `COURSE_LIMIT_REACHED` (403)
* `DUPLICATE_COURSE_NAME` (409)

---

### 2.3 PATCH /api/courses/:courseId

**请求**：`{ "name"?: string, "school"?: string, "term"?: string }`

**错误码**：`NOT_FOUND` (404), `DUPLICATE_COURSE_NAME` (409)

---

### 2.4 DELETE /api/courses/:courseId

**行为**：删除课程及其下所有文件与AI数据

**错误码**：`NOT_FOUND` (404), `FORBIDDEN` (403)

---

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

---

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
        "uploadedAt": "2025-01-20T08:00:00Z"
      }
    ]
  }
}
```

**字段说明**：
* `type`: `"Lecture" | "Homework" | "Exam" | "Other"`
* `isScanned`: 是否缺乏文本层（扫描件）

---

### 2.7 POST /api/courses/:courseId/files

**请求格式**：`multipart/form-data`
* `files[]`: PDF文件（支持多文件）
* `types[]`: 对应类型（`"Lecture" | "Homework" | "Exam" | "Other"`）

**规则**：
* 仅支持PDF格式
* 同课程下文件名不可重复
* 自动提取：页数`pageCount`、文本可用性`isScanned`

**错误码**：
* `UNSUPPORTED_FILE_TYPE` (415)
* `FILE_NAME_CONFLICT` (409)

---

### 2.8 PATCH /api/files/:fileId

**请求**：`{ "name"?: string, "type"?: "Lecture"|"Homework"|"Exam"|"Other" }`

---

### 2.9 DELETE /api/files/:fileId

**行为**：删除文件及相关AI数据（贴纸、总结）

---

## 3. 学习与AI功能

### 3.0 通用约定

#### 3.0.1 贴纸数据模型

```typescript
{
  "id": "sticker_123",
  "userId": "user_1",
  "courseId": "course_1",
  "fileId": "file_9",
  "type": "auto" | "manual",        // 自动讲解 | 手动讲解
  "source": "pdf" | "sticker",      // 来自PDF | 来自贴纸追问
  "page": 12,
  "anchor": {
    "textSnippet": "Definition: A sequence {a_n} ...",
    "rect": { "x": 0.15, "y": 0.32, "width": 0.7, "height": 0.08 }
  },
  "parentId": null,                 // 追问链父贴纸ID
  "order": 3150,                    // 列表排序
  "contentMarkdown": "### Main idea\n...",
  "folded": false,
  "createdAt": "2025-01-20T10:00:00Z"
}
```

**字段说明**：
* `type: "auto"`: 通过"Explain this page"生成
* `type: "manual"`: 从PDF或贴纸选中文本触发
* `source: "pdf"`: 原始选区来自PDF
* `source: "sticker"`: 来自某条贴纸（追问链）
* `anchor.rect`: 相对位置（0-1范围），用于左右联动
* `parentId`: 追问链指向，顶层贴纸为`null`

#### 3.0.2 配额桶枚举

| 配额桶 | 包含操作 | 默认限制 | 粒度 |
|--------|---------|---------|------|
| `learningInteractions` | 选中讲解(PDF/贴纸) + 问答 | 50次/课程 | (userId, courseId) |
| `documentSummary` | 文档总结 | 10次/课程 | (userId, courseId) |
| `sectionSummary` | 章节总结 | 15次/课程 | (userId, courseId) |
| `courseSummary` | 课程级提纲 | 3次/课程 | (userId, courseId) |
| *(内部限流)* `autoExplain` | 自动讲解 | 20次/文件/天 | (userId, fileId, date) |

**注意**：自动讲解不占用户可见配额，仅通过`rateLimit`字段返回

#### 3.0.3 AI文本格式约定

所有AI输出字段（`contentMarkdown`, `rawMarkdown`, `answer.text`）为**Markdown字符串**：
* **Markdown**：标题/粗体/列表/表格/引用等完整语法
* **LaTeX**：行内`$...$`或`\(...\)`，块级`$$...$$`或`\[...\]`
* **代码**：` ```python`等，行内单反引号
* **约束**：后端不返回HTML，前端用`MarkdownRenderer`统一渲染

#### 3.0.4 LLM Provider

* 所有AI端点（explain-page/explain-selection/qa/summarize-*）统一使用**OpenAI API**
* 仅服务端调用，API Key仅在服务端环境变量
* 前端不直接调用任何LLM SDK

---

### 3.1 GET /api/files/:fileId/stickers

**查询参数**（可选）：
* `page`: 仅返回该页贴纸
* `pageFrom` + `pageTo`: 页区间
* `includeThreads`: 是否包含追问链（默认true）

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

**排序**：按`page`升序 → `order`升序

---

### 3.2 PATCH /api/stickers/:stickerId

**请求**（全部可选）：
```json
{
  "folded"?: boolean,
  "order"?: number,
  "anchor"?: { "rect"?: { "x": number, "y": number, "width": number, "height": number } }
}
```

**约束**：
* 不允许修改`type`, `source`, `contentMarkdown`
* MVP不提供删除接口
* 仅允许当前用户操作自己课程下的贴纸

**错误码**：`NOT_FOUND` (404), `FORBIDDEN` (403)

---

### 3.3 POST /api/ai/explain-page

**功能**：对当前页生成自动讲解贴纸（`type="auto"`）

**请求**：
```json
{
  "courseId": "course_1",
  "fileId": "file_1",
  "page": 3,
  "pageRange"?: { "from": 3, "to": 4 },  // 可选，小范围区间
  "sessionId"?: "session_abc"
}
```

**响应**：
```json
{
  "ok": true,
  "data": {
    "stickers": [ /* 见§3.0.1，type="auto" */ ],
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
| 按文件每日 | (userId, fileId, date_UTC) | 20次/天 | 00:00 UTC |
| 单次请求 | - | 最多6条贴纸 | - |

**计数规则**：
* 每次成功调用计1次（无论生成几条贴纸）
* 若页面已有自动贴纸缓存，不重复调用，也不计数
* 失败请求不计数

**配额说明**：
* 不计入`learningInteractions`等用户可见配额
* 仅通过`rateLimit`字段透传给前端

**错误码**：

| 错误码 | HTTP | 前端行为 |
|--------|------|---------|
| `AUTO_EXPLAIN_LIMIT_REACHED` | 429 | "今日自动讲解已用完(20/20)，明日00:00 UTC重置。您仍可使用选中讲解。" |
| `PAGE_RANGE_TOO_LARGE` | 400 | 提示缩小范围 |
| `SCANNED_PDF_UNSUPPORTED` | 422 | "该PDF为扫描件，暂不支持自动讲解" |

---

### 3.4 POST /api/ai/explain-selection

**功能**：对选中文本生成手动讲解贴纸（`type="manual"`）

**请求**：
```json
{
  "courseId": "course_1",
  "fileId": "file_1",
  "page": 10,
  "sourceType": "pdf" | "sticker",
  "sourceStickerId"?: "sticker_5",  // sourceType="sticker"时必填
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
* `sourceType="pdf"`: `parentId=null`，插入到对应页面位置
* `sourceType="sticker"`: `parentId=sourceStickerId`，紧挨父贴纸

**响应**：
```json
{
  "ok": true,
  "data": {
    "sticker": { /* 见§3.0.1, type="manual" */ },
    "quota": {
      "bucket": "learningInteractions",
      "used": 13,
      "limit": 50,
      "remaining": 37
    }
  }
}
```

**配额**：计入`learningInteractions`（包括PDF和贴纸来源）

**错误码**：
* `QUOTA_EXCEEDED` (429)
* `SCANNED_PDF_UNSUPPORTED` (422)
* `NOT_FOUND` (404): 父贴纸不存在

---

### 3.5 POST /api/ai/qa

**功能**：基于当前PDF的问答

**请求**：
```json
{
  "courseId": "course_1",
  "fileId": "file_1",
  "question": "这章几个定理的关系是什么？",
  "pageHint"?: 5,  // 当前阅读页，用于聚焦
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
      "used": 20,
      "limit": 50,
      "remaining": 30
    }
  }
}
```

**规则**：
* 仅基于当前fileId所在PDF，不跨课程/不跨PDF
* 可利用已有贴纸作为辅助上下文
* `citations`可用于前端展示页码并跳转

**配额**：计入`learningInteractions`

---

### 3.6 POST /api/ai/summarize-document

**功能**：对单个PDF生成整体总结

**请求**：
```json
{
  "courseId": "course_1",
  "fileId": "file_1",
  "maxSections"?: 10  // 限制总结最大章节数
}
```

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
      "used": 3,
      "limit": 10,
      "remaining": 7
    }
  }
}
```

**配额**：计入`documentSummary`

---

### 3.7 POST /api/ai/summarize-section

**功能**：对页区间生成章节总结

**请求**：
```json
{
  "courseId": "course_1",
  "fileId": "file_1",
  "pageRange": { "from": 5, "to": 8 }
}
```

**响应**：
```json
{
  "ok": true,
  "data": {
    "summary": {
      "title": "Section: Derivatives",
      "bullets": ["Definition of derivative using limits.", "Basic derivative rules."],
      "rawMarkdown": "## Section: Derivatives\n...",
      "reference": {
        "fileId": "file_1",
        "pageRange": { "from": 5, "to": 8 }
      }
    },
    "quota": {
      "bucket": "sectionSummary",
      "used": 5,
      "limit": 15,
      "remaining": 10
    }
  }
}
```

**配额**：计入`sectionSummary`

**错误码**：`PAGE_RANGE_TOO_LARGE` (400)

---

### 3.8 POST /api/ai/summarize-course

**功能**：基于课程下多份PDF生成课程级提纲

**请求**：
```json
{
  "courseId": "course_1",
  "fileIds"?: ["file_1", "file_2"]  // 可选，默认使用课程下所有Lecture/Homework/Exam
}
```

**规则**：
* 优先利用已有文档/章节总结缓存
* 若无缓存，内部先触发文档级总结再合并

**响应**：
```json
{
  "ok": true,
  "data": {
    "summary": {
      "outline": [
        {
          "title": "Part I: Foundations",
          "children": [
            {
              "title": "Chapter 1: Limits",
              "highFrequencyTopics": ["Limit definition", "Continuity"],
              "typicalProblems": ["Compute limits", "Determine continuity"],
              "relatedFiles": [
                { "fileId": "file_1", "page": 3 }
              ]
            }
          ]
        }
      ],
      "rawMarkdown": "# Course outline\n## Part I: ...",
      "reference": { "courseId": "course_1" }
    },
    "quota": {
      "bucket": "courseSummary",
      "used": 1,
      "limit": 3,
      "remaining": 2
    }
  }
}
```

**配额**：计入`courseSummary`

---

## 4. 配额与实验规则

### 4.0 配额架构

**配额粒度**：

| 类型 | 粒度 | 说明 |
|------|------|------|
| 课程数量 | `(userId)` | 用户级全局，默认6门 |
| AI配额 | `(userId, courseId)` | 每门课程独立计数 |

**原因**：符合"以课程为中心"的产品设计，避免单课程耗尽全局配额

**前端展示**：
* P4课程详情页：显示"本课程剩余配额"
* P7配额页：按课程分组展示
* P5 PDF学习页：按钮附近显示当前课程配额状态

### 4.1 GET /api/account/quotas

**功能**：获取课程数量与AI配额

**查询参数**（可选）：
* `courseId`: 若提供，仅返回该课程配额

**响应（完整）**：
```json
{
  "ok": true,
  "data": {
    "courseQuota": {
      "limit": 6,
      "used": 4,
      "remaining": 2
    },
    "aiQuotasByCourse": {
      "course_1": {
        "courseId": "course_1",
        "courseName": "Calculus I",
        "quotas": {
          "learningInteractions": { "limit": 50, "used": 23, "remaining": 27 },
          "documentSummary": { "limit": 10, "used": 3, "remaining": 7 },
          "sectionSummary": { "limit": 15, "used": 5, "remaining": 10 },
          "courseSummary": { "limit": 3, "used": 1, "remaining": 2 }
        }
      }
    }
  }
}
```

**响应（单课程）**：
```json
// GET /api/account/quotas?courseId=course_1
{
  "ok": true,
  "data": {
    "courseId": "course_1",
    "courseName": "Calculus I",
    "quotas": {
      "learningInteractions": { "limit": 50, "used": 23, "remaining": 27 },
      /* ... */
    }
  }
}
```

---

## 5. 日志与监控（内部建议）

**AI调用日志**（建议记录）：
* userId / courseId / fileId
* 接口类型（explain-page / explain-selection / qa / summarize-*）
* 请求参数摘要（页码/区间/问题长度）
* 模型名称与版本
* token数 / 耗时
* 是否触发配额限制/限流
* 是否失败及失败类型

**贴纸行为日志**：
* 贴纸创建（自动/手动）
* 折叠/展开状态变化
* 自动与手动贴纸使用比例

**指标与报警**：
* 每日/周AI调用次数（按配额桶拆分）
* 自动讲解调用次数与限流命中次数
* 平均延迟 / P95延迟
* 错误率（按错误类型拆分）

---

## 6. 错误码与响应结构

### 6.1 通用响应结构

**成功**：
```json
{
  "ok": true,
  "data": { /* ... */ }
}
```

**错误**：
```json
{
  "ok": false,
  "error": {
    "code": "QUOTA_EXCEEDED",
    "message": "You've reached the AI usage limit for this experiment.",
    "details"?: { /* 可选，额外上下文 */ }
  }
}
```

### 6.2 错误码枚举

#### 通用错误

| 错误码 | HTTP | 说明 |
|--------|------|------|
| `UNAUTHORIZED` | 401 | 未登录或会话无效 |
| `FORBIDDEN` | 403 | 已登录但无权访问 |
| `INVALID_INPUT` | 400 | 请求参数不合法 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `INTERNAL_ERROR` | 500 | 服务器内部错误 |

#### 认证相关

| 错误码 | HTTP | 前端行为 |
|--------|------|---------|
| `INVALID_CREDENTIALS` | 401 | 提示检查凭证 |
| `EMAIL_NOT_CONFIRMED` | 403 | 显示"重发邮件"按钮 |
| `EMAIL_ALREADY_EXISTS` | 409 | 提示去登录页 |
| `ALREADY_CONFIRMED` | 400 | 提示去登录 |
| `RATE_LIMIT_EXCEEDED` | 429 | 稍后重试 |

#### 业务相关

| 错误码 | HTTP | 说明 |
|--------|------|------|
| `COURSE_LIMIT_REACHED` | 403 | 课程数达上限 |
| `DUPLICATE_COURSE_NAME` | 409 | 课程名重复 |
| `UNSUPPORTED_FILE_TYPE` | 415 | 非PDF文件 |
| `FILE_NAME_CONFLICT` | 409 | 文件名重复 |
| `PAGE_RANGE_TOO_LARGE` | 400 | 页区间>10页 |
| `SCANNED_PDF_UNSUPPORTED` | 422 | PDF无文本层 |

#### 配额/限流

| 错误码 | HTTP | 说明 |
|--------|------|------|
| `QUOTA_EXCEEDED` | 429 | AI配额（按课程）已用完 |
| `AUTO_EXPLAIN_LIMIT_REACHED` | 429 | 自动讲解（按文件/天）已达上限 |

**错误响应格式（标准）**：
```json
{
  "ok": false,
  "error": {
    "code": "QUOTA_EXCEEDED",
    "message": "You've reached the usage limit for learning interactions in this course.",
    "details": {
      "courseId": "course_1",
      "bucket": "learningInteractions",
      "used": 50,
      "limit": 50
    }
  }
}
```

**字段说明**：
* `code`: 机器可读，前端用于匹配处理逻辑
* `message`: 用户可读，可直接展示
* `details`: 可选，提供额外上下文
