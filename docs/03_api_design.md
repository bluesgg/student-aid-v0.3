# 03 API / 接口设计（草稿）

> 说明：本接口设计为后端 / BFF 视角的抽象 REST API，**实际实现基于 Supabase（Auth + Postgres + Storage）封装**。
> BaaS SDK **仅在 server-side Route Handlers 中使用**，前端仅调用 `/api/*` 业务接口。
> 所有以 `/api/*` 开头的接口默认为 **需要登录的受保护接口**（除登录 / 注册本身），鉴权方式推荐为 `Authorization: Bearer <token>`。
> 返回内容统一为 JSON；错误采用统一错误结构，详见文末「错误码与通用响应结构」。

本版本已对「AI 讲解 / 贴纸 / 问答 / 总结」相关接口进行了更新，使其与最新的 `01_light_prd.md`、`02_page_and_flow_design.md` 中的设计保持一致，特别是：

* 「解释当前页 / Explain this page」为**显式触发**的自动讲解；
* 贴纸（Sticker）作为独立实体持久化，包括自动讲解贴纸与选中文本讲解贴纸；
* 自动讲解不计入用户可见配额（learningInteractions），但仍需后端限流；
* 所有 AI 文本统一返回 Markdown（支持 LaTeX / 代码高亮）。

---

## 1. 用户与认证相关

### 1.1 POST /api/auth/register

* **功能**：新用户注册，创建账号。

* **是否鉴权**：否。

* **请求体（JSON）**：

  * `email`: `string`，必填。
  * `password`: `string`，必填，需满足最小长度（例如 ≥ 8）。

* **响应**：

  ```json
  {
    "ok": true,
    "data": {
      "user": {
        "id": "user_123",
        "email": "foo@example.com",
        "createdAt": "2025-01-01T12:00:00Z"
      },
      "accessToken": "jwt-token"
    }
  }
  ```

* **错误码**：

  * `INVALID_INPUT`（邮箱格式错误、密码过短等）
  * `EMAIL_ALREADY_EXISTS`（邮箱已注册）

---

### 1.2 POST /api/auth/login

* **功能**：用户登录，获取 access token。

* **是否鉴权**：否。

* **请求体（JSON）**：

  * `email`: `string`，必填。
  * `password`: `string`，必填。

* **响应**：

  ```json
  {
    "ok": true,
    "data": {
      "user": {
        "id": "user_123",
        "email": "foo@example.com"
      },
      "accessToken": "jwt-token",
      "expiresIn": 3600
    }
  }
  ```

* **错误码**：

  * `UNAUTHORIZED`（账号不存在或密码错误）
  * `INVALID_INPUT`

---

### 1.3 GET /api/auth/me

* **功能**：获取当前登录用户信息。

* **是否鉴权**：是。

* **响应**：

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

* **错误码**：

  * `UNAUTHORIZED`（token 过期或无效）

---

### 1.4 POST /api/auth/logout

* **功能**：登出，服务端可做 token 失效（如维护 denylist）；前端同时清理本地状态。
* **是否鉴权**：是。
* **请求体**：空。
* **响应**：

  ```json
  {
    "ok": true
  }
  ```

---

## 2. 课程与资料（文件）相关

> 对应 P3「我的课程列表页」与 P4「课程详情 & 资料中心」的接口层定义。

### 2.1 GET /api/courses

* **功能**：获取当前用户的课程列表（用于 P3「My Courses」）。
* **是否鉴权**：是。
* **查询参数（可选）**：

  * `orderBy`: `string`，排序字段（如 `recent` / `createdAt`），默认 `recent`。
* **响应**：

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

* **功能**：创建课程。

* **是否鉴权**：是。

* **请求体（JSON）**：

  * `name`: `string`，必填。
  * `school`: `string`，可选。
  * `term`: `string`，可选，如 `"Fall 2025"`。

* **业务规则**：

  * 同一用户下课程名需唯一；
  * 创建前需检查课程数量配额（见第 4 节）。

* **响应**：

  ```json
  {
    "ok": true,
    "data": {
      "id": "course_1",
      "name": "Calculus I",
      "school": "ABC University",
      "term": "Spring 2025",
      "createdAt": "2025-01-05T09:00:00Z"
    }
  }
  ```

* **错误码**：

  * `COURSE_LIMIT_REACHED`
  * `INVALID_INPUT`
  * `DUPLICATE_COURSE_NAME`

---

### 2.3 PATCH /api/courses/:courseId

* **功能**：更新课程信息（名称、学校、学期）。

* **是否鉴权**：是。

* **请求体（JSON）**（部分字段可选更新）：

  * `name?: string`
  * `school?: string`
  * `term?: string`

* **响应**：

  ```json
  {
    "ok": true,
    "data": {
      "id": "course_1",
      "name": "New name",
      "school": "ABC University",
      "term": "Spring 2025"
    }
  }
  ```

* **错误码**：

  * `NOT_FOUND`（课程不存在或非当前用户）
  * `INVALID_INPUT`
  * `DUPLICATE_COURSE_NAME`

---

### 2.4 DELETE /api/courses/:courseId

* **功能**：删除课程及其下所有文件与 AI 相关数据（贴纸、总结等）。

* **是否鉴权**：是。

* **请求体**：空。

* **响应**：

  ```json
  {
    "ok": true
  }
  ```

* **错误码**：

  * `NOT_FOUND`
  * `FORBIDDEN`（当前用户无权限）

---

### 2.5 GET /api/courses/:courseId

* **功能**：获取单个课程详情及基础统计信息。
* **是否鉴权**：是。
* **响应**：

  ```json
  {
    "ok": true,
    "data": {
      "id": "course_1",
      "name": "Calculus I",
      "school": "ABC University",
      "term": "Spring 2025",
      "fileCount": 12,
      "createdAt": "2025-01-05T09:00:00Z",
      "updatedAt": "2025-03-10T10:00:00Z"
    }
  }
  ```

---

### 2.6 GET /api/courses/:courseId/files

* **功能**：获取课程下的文件列表，用于 P4 文件分组展示。
* **是否鉴权**：是。
* **响应**：

  ```json
  {
    "ok": true,
    "data": {
      "courseId": "course_1",
      "files": [
        {
          "id": "file_1",
          "name": "Week1_Lecture.pdf",
          "type": "Lecture",
          "pageCount": 25,
          "isScanned": false,
          "uploadedAt": "2025-01-20T08:00:00Z",
          "updatedAt": "2025-01-20T08:00:00Z"
        }
      ]
    }
  }
  ```

> `isScanned`：后端粗略检测该 PDF 是否缺乏文本层（扫描件），用于在 P5 提示「暂不支持 AI 讲解」。

---

### 2.7 POST /api/courses/:courseId/files

* **功能**：在课程中上传一个或多个 PDF 文件。

* **是否鉴权**：是。

* **请求格式**：`multipart/form-data`

  * 字段示例：

    * `files[]`: PDF 文件（二进制），支持多文件。
    * `types[]`: 对应每个文件的类型枚举：`"Lecture" | "Homework" | "Exam" | "Other"`。

* **业务规则**：

  * 仅支持 PDF 格式，非 PDF 返回错误；
  * 同一课程中不能有同名文件；
  * 后端自动提取并存储：

    * 页数 `pageCount`；
    * 初步文本可用性标记 `isScanned`。

* **响应**：

  ```json
  {
    "ok": true,
    "data": {
      "courseId": "course_1",
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

* **错误码**：

  * `UNSUPPORTED_FILE_TYPE`
  * `FILE_NAME_CONFLICT`
  * `INVALID_INPUT`

---

### 2.8 PATCH /api/files/:fileId

* **功能**：更新文件元信息（主要是类型、名称）。
* **是否鉴权**：是。
* **请求体（JSON）**：

  * `name?: string`
  * `type?: "Lecture" | "Homework" | "Exam" | "Other"`
* **响应**：

  ```json
  {
    "ok": true,
    "data": {
      "id": "file_1",
      "name": "Week1_Lecture_updated.pdf",
      "type": "Exam",
      "pageCount": 25,
      "isScanned": false
    }
  }
  ```

---

### 2.9 DELETE /api/files/:fileId

* **功能**：删除单个 PDF 文件及相关 AI 数据（贴纸、总结等）。

* **是否鉴权**：是。

* **响应**：

  ```json
  {
    "ok": true
  }
  ```

* **错误码**：

  * `NOT_FOUND`
  * `FORBIDDEN`

---

## 3. 学习 & AI 功能相关

> 服务于 P5「PDF 阅读 & AI 学习页」及 P6「课程级复习提纲页」。
> 所有 AI 类接口都需要做 **配额检查**（见第 4 节），并记录调用日志。

### 3.0 AI 会话 / 贴纸 / 文本格式说明（重要）

#### 3.0.1 会话上下文（sessionId）

* 对于同一 PDF 的多轮交互（自动讲解、选中讲解、问答），可以共用一个会话 ID（如 `sessionId`），由前端在首次调用时从后端获取或后端自动生成，并在后续调用中携带。
* 行为建议：

  * 若请求中未提供 `sessionId`，后端可视为新会话并自动生成；
  * 会话主要用于：

    * 复用最近几轮对话上下文（特别是问答）；
    * 复用已检索的段落 / 分块（RAG 缓存）。

#### 3.0.2 贴纸（Sticker）数据模型（API 视角）

> Sticker 为右侧贴纸栏中的最小展示 / 持久化单位，包含自动讲解贴纸与选中文本讲解贴纸。

典型 Sticker 结构示例：

```json
{
  "id": "sticker_123",
  "userId": "user_1",
  "courseId": "course_1",
  "fileId": "file_9",
  "type": "auto",
  "source": "pdf",
  "page": 12,
  "anchor": {
    "textSnippet": "Definition: A sequence {a_n} ...",
    "rect": {
      "x": 0.15,
      "y": 0.32,
      "width": 0.7,
      "height": 0.08
    }
  },
  "parentId": null,
  "order": 3150,
  "contentMarkdown": "### Main idea\nThis part introduces the **definition of limit for sequences**...",
  "folded": false,
  "createdAt": "2025-01-20T10:00:00Z",
  "updatedAt": "2025-01-20T10:00:00Z"
}
```

字段说明（逻辑层面）：

* `type`: `"auto" | "manual"`：

  * `auto`：通过「Explain this page」生成的自动讲解贴纸；
  * `manual`：从 PDF 或贴纸选中文本触发的讲解贴纸（包含追问链）。
* `source`: `"pdf" | "sticker"`：

  * `pdf`：原始选区来自 PDF；
  * `sticker`：来自某条贴纸正文（追问链）。
* `page`: 贴纸主锚点所在页码（从 1 开始）。
* `anchor`：

  * `textSnippet`：原文片段（用于在贴纸头部展示）；
  * `rect`：在该页内的相对位置（0–1 范围），用于左右联动和大致对齐。
* `parentId`：

  * 若贴纸为追问链的一部分，指向上一条贴纸的 `id`；
  * 顶层贴纸为 `null`。
* `order`：

  * 用于在右侧贴纸列表中的排序；
  * 同一页内，自动贴纸通常排在手动贴纸前；
  * 追问链内按 `parentId` + `order` 排。

> MVP 不支持编辑贴纸正文、不支持删除贴纸（仅支持折叠 / 展开）。

#### 3.0.3 贴纸创建与持久化规则

* 所有由 AI 生成的贴纸（自动 / 手动）均由 **后端负责创建并持久化**：

  * `POST /api/ai/explain-page`：创建 1~N 条自动贴纸；
  * `POST /api/ai/explain-selection`：创建 1 条手动贴纸（或追问贴纸）。
* 前端不直接创建 / 编辑 Sticker 实体，仅通过 AI 接口或专门的更新接口修改有限字段（如折叠状态）。
* 再次打开某 PDF 文件时：

  * 通过 `GET /api/files/:fileId/stickers` 获取已有贴纸；
  * 自动贴纸不重复生成。

#### 3.0.4 配额桶（quotaBucket）枚举与策略

> 与 `01_light_prd.md` 中的「按课程计配额」策略保持一致。

* `learningInteractions`：

  * 计入：

    * 选中文本讲解贴纸（从 PDF 选中触发）；
    * 从贴纸继续追问生成的贴纸（来源为 `sticker`）；
    * 基于当前 PDF 的自由问答。
  * **不计入**：

    * 自动讲解贴纸（Explain this page）。
* `documentSummary`：

  * 文档总结（Summarize this document）。
* `sectionSummary`：

  * 章节总结（Summarize this section）。
* `courseSummary`：

  * 课程级提纲（Generate course outline）。
* 自动讲解（Explain this page）：

  * 不计入任何用户可见配额桶；
  * 后端可内部视为 `autoExplain` 类型做限流与监控（不暴露给前端配额视图）。

#### 3.0.5 AI 文本 / 回复格式约定

所有 AI 接口返回的文本字段（如 `contentMarkdown`、`answer.text`、各类 `summary.rawMarkdown` 字段）统一为 **Markdown 字符串**，并支持：

* **Markdown 格式化**：

  * 完整 Markdown 语法（标题、粗体 / 斜体、列表、链接、表格、引用块等）。
* **LaTeX 数学公式**：

  * 行内公式：`$...$` 或 `\(...\)`；
  * 块级公式：`$$...$$` 或 `\[...\]`；
  * 前端使用 KaTeX 渲染。
* **代码语法高亮**：

  * 使用三反引号代码块并带语言标记，例如：

    * ```python、```javascript、```java、```cpp 等；
  * 行内代码使用单反引号。

> 接口层 **不返回 HTML**，只返回纯文本 Markdown；渲染逻辑统一由前端 Markdown 组件负责。

#### 3.0.6 LLM Provider（实现约束）

* 本 MVP 的 AI 能力（`explain-page`、`explain-selection`、`qa`、`summarize-*`）统一由 **OpenAI API** 提供；
* OpenAI 调用发生在服务端（Route Handlers / BFF）内部，API Key 仅在服务端环境变量中；
* 前端不直接调用任何第三方 LLM SDK 或暴露密钥。

---

### 3.1 GET /api/files/:fileId/stickers — 获取文件贴纸列表

* **功能**：获取某个 PDF 文件下的贴纸列表，用于 P5 右侧贴纸栏初始化与按需加载。

* **是否鉴权**：是。

* **查询参数（可选）**：

  * `page`: `number`，可选，若指定则仅返回该页相关贴纸；
  * `pageFrom`: `number`，可选，配合 `pageTo` 表示页区间；
  * `pageTo`: `number`，可选；
  * `includeThreads`: `boolean`，默认 `true`，表示是否包含整个追问链；若为 `false`，可仅返回顶层贴纸。

* **响应**：

  ```json
  {
    "ok": true,
    "data": {
      "fileId": "file_1",
      "stickers": [
        {
          "id": "sticker_123",
          "userId": "user_1",
          "courseId": "course_1",
          "fileId": "file_1",
          "type": "auto",
          "source": "pdf",
          "page": 3,
          "anchor": {
            "textSnippet": "Definition 1.1: Limit of a function ...",
            "rect": { "x": 0.1, "y": 0.2, "width": 0.8, "height": 0.1 }
          },
          "parentId": null,
          "order": 2000,
          "contentMarkdown": "## Main ideas\n- Introduce the **definition of limit** ...",
          "folded": false,
          "createdAt": "2025-01-20T08:00:00Z",
          "updatedAt": "2025-01-20T08:00:00Z"
        }
      ]
    }
  }
  ```

* **业务规则**：

  * 默认返回当前用户在该文件下的所有贴纸；
  * 排序优先级：按 `page` 升序 → `order` 升序。

---

### 3.2 PATCH /api/stickers/:stickerId — 更新贴纸状态

* **功能**：更新单条贴纸的部分字段（MVP 主要用于折叠 / 展开、位置微调）。

* **是否鉴权**：是。

* **请求体（JSON）**（全部可选）：

  ```ts
  {
    "folded"?: boolean,
    "order"?: number,
    "anchor"?: {
      "rect"?: { "x": number, "y": number, "width": number, "height": number }
    }
  }
  ```

* **响应**：

  ```json
  {
    "ok": true,
    "data": {
      "id": "sticker_123",
      "folded": true,
      "order": 2000,
      "updatedAt": "2025-01-21T09:00:00Z"
    }
  }
  ```

* **业务规则**：

  * 不允许修改：

    * `type`、`source`、`contentMarkdown` 等核心字段；
  * MVP 不提供删除接口；
  * 仅允许当前用户操作自己课程下的贴纸。

* **错误码**：

  * `NOT_FOUND`
  * `FORBIDDEN`
  * `INVALID_INPUT`

---

### 3.3 POST /api/ai/explain-page — 自动讲解当前页（Explain this page）

* **功能**：对当前页或指定页区间进行自动讲解，生成若干条 **自动讲解贴纸**（`type = "auto"`）。

* **是否鉴权**：是。

* **请求体（JSON）**：

  ```ts
  {
    "courseId": string,
    "fileId": string,
    "page": number, // 当前页面页码，从 1 开始
    "pageRange"?: { "from": number; "to": number }, // 可选，若提供则表示对页区间进行讲解（通常为小范围，如当前页 ±1）
    "sessionId"?: string
  }
  ```

* **业务规则**：

  * 由前端在用户点击「Explain this page」按钮时触发；
  * 若 `pageRange` 存在，则以 `pageRange` 为主；
  * 页区间过大（如 > 10 页）时可返回错误或提示前端限制；
  * 只针对可选中文本的 PDF（`isScanned = false`），否则返回错误或友好提示；
  * 模型需根据 PDF 类型（Lecture / Homework / Exam）调整讲解风格：

    * Lecture：内容概览 + 概念讲解 + 公式直觉；
    * Homework / Exam：以考点和思路为主，避免直接给完整答案。

* **响应**：

  ```json
  {
    "ok": true,
    "data": {
      "stickers": [
        {
          "id": "sticker_auto_1",
          "type": "auto",
          "source": "pdf",
          "courseId": "course_1",
          "fileId": "file_1",
          "page": 3,
          "anchor": {
            "textSnippet": "Definition 1.1: Limit of a function ...",
            "rect": { "x": 0.1, "y": 0.2, "width": 0.8, "height": 0.1 }
          },
          "parentId": null,
          "order": 2100,
          "contentMarkdown": "## Main idea on this block\n- Introduce the **definition of limit** ...",
          "folded": false,
          "createdAt": "2025-01-20T08:00:00Z",
          "updatedAt": "2025-01-20T08:00:00Z"
        }
      ],
      "reference": {
        "fileId": "file_1",
        "pageRange": { "from": 3, "to": 3 }
      },
      "rateLimit": {
        "type": "autoExplain",
        "usedToday": 5,
        "limitPerFilePerDay": 50,
        "remainingToday": 45
      }
    }
  }
  ```

* **配额说明**：

  * 自动讲解贴纸不计入用户可见配额桶（`learningInteractions` 等）；
  * 仅在后端层面进行 `autoExplain` 频率 / 并发限制；
  * `rateLimit` 字段仅用于前端展示“今日自动讲解次数”的提示，不纳入 `GET /api/account/quotas` 的 `aiQuotas` 中。

* **错误码**：

  * `UNAUTHORIZED`
  * `NOT_FOUND`（课程或文件不存在 / 非当前用户）
  * `PAGE_RANGE_TOO_LARGE`
  * `AUTO_EXPLAIN_LIMIT_REACHED`（内部限流）
  * `SCANNED_PDF_UNSUPPORTED`（该文件为扫描件，不支持自动讲解）

---

### 3.4 POST /api/ai/explain-selection — 选中文本讲解（贴纸 & 追问链）

* **功能**：对用户在 PDF 或贴纸中选中的文本片段进行针对性解释，生成一条新的 **手动贴纸**（`type = "manual"`）。

* **是否鉴权**：是。

* **请求体（JSON）**：

  ```ts
  {
    "courseId": string,
    "fileId": string,
    "page": number,
    "sourceType": "pdf" | "sticker",
    "sourceStickerId"?: string,        // 当 sourceType = "sticker" 时必填
    "selectionText": string,           // 选中的文本内容（若可抽取）
    "selectionContext"?: string,       // 可选，上下文（前后若干句）
    "anchor"?: {
      "textSnippet"?: string,
      "rect"?: { "x": number; "y": number; "width": number; "height": number }
    },
    "sessionId"?: string
  }
  ```

* **业务规则**：

  * 当 `sourceType = "pdf"`：

    * 代表从 PDF 原文选中触发；
    * `parentId = null`；
  * 当 `sourceType = "sticker"`：

    * 代表在某条贴纸上选中继续追问；
    * 新贴纸的 `parentId = sourceStickerId`；
  * 新贴纸的 `type` 固定为 `"manual"`；
  * 填充 `anchor.textSnippet` 以及合理的 `order`，使其在 UI 中靠近原文位置或紧挨父贴纸。

* **响应**：

  ```json
  {
    "ok": true,
    "data": {
      "sticker": {
        "id": "sticker_manual_1",
        "type": "manual",
        "source": "pdf",
        "courseId": "course_1",
        "fileId": "file_1",
        "page": 10,
        "anchor": {
          "textSnippet": "We define the derivative at a point ...",
          "rect": { "x": 0.15, "y": 0.4, "width": 0.7, "height": 0.1 }
        },
        "parentId": null,
        "order": 3050,
        "contentMarkdown": "### 先用大白话说一遍\n...\n### 再按步骤走一遍\n1. ...",
        "folded": false,
        "createdAt": "2025-01-20T09:00:00Z",
        "updatedAt": "2025-01-20T09:00:00Z"
      },
      "reference": {
        "fileId": "file_1",
        "page": 10
      },
      "quota": {
        "bucket": "learningInteractions",
        "used": 13,
        "limit": 50,
        "remaining": 37
      }
    }
  }
  ```

* **配额说明**：

  * 所有 `explain-selection` 调用均计入 `learningInteractions`；
  * 包括从 PDF 选中和从贴纸继续追问两类。

* **错误码**：

  * `UNAUTHORIZED`
  * `NOT_FOUND`（课程、文件或父贴纸不存在）
  * `SCANNED_PDF_UNSUPPORTED`
  * `QUOTA_EXCEEDED`（learningInteractions 触顶）
  * `INVALID_INPUT`

---

### 3.5 POST /api/ai/qa — 基于当前 PDF 的问答

* **功能**：用户就当前 PDF 内容提出问题，AI 基于 PDF 上下文给出回答。

* **是否鉴权**：是。

* **请求体（JSON）**：

  ```ts
  {
    "courseId": string,
    "fileId": string,
    "question": string,
    "pageHint"?: number,   // 当前阅读页码，便于模型聚焦该区域
    "sessionId"?: string
  }
  ```

* **响应**：

  ```json
  {
    "ok": true,
    "data": {
      "answer": {
        "text": "In this section, the limit definition ...",
        "rawMarkdown": "### Answer\nIn this section, the **limit definition** ...",
        "relatedPages": [3, 4, 10],
        "citations": [
          {
            "fileId": "file_1",
            "page": 3,
            "snippet": "Definition 1.1 ..."
          }
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

* **业务规则**：

  * 问答仅基于当前 `fileId` 所在 PDF，不跨课程 / 不跨 PDF；
  * 模型可利用与该 PDF 相关的贴纸内容作为辅助上下文，但回答仍需可回溯到原文；
  * `citations` 字段可用于前端展示引用页码并支持跳转。

* **错误码**：

  * `UNAUTHORIZED`
  * `NOT_FOUND`
  * `SCANNED_PDF_UNSUPPORTED`
  * `QUOTA_EXCEEDED`
  * `INVALID_INPUT`

---

### 3.6 POST /api/ai/summarize-document — 文档总结

* **功能**：对单个 PDF 文档进行整体总结，输出结构化提纲与关键公式。

* **是否鉴权**：是。

* **请求体（JSON）**：

  ```ts
  {
    "courseId": string,
    "fileId": string,
    "maxSections"?: number // 可选，限制总结的最大章节数量（如 10）
  }
  ```

* **响应**：

  ```json
  {
    "ok": true,
    "data": {
      "summary": {
        "outline": [
          {
            "title": "Chapter 1: Limits and Continuity",
            "keyConcepts": [
              "Definition of limit",
              "One-sided limits",
              "Continuity at a point"
            ],
            "keyFormulas": [
              "$\\lim_{x\\to a} f(x) = L$"
            ]
          }
        ],
        "rawMarkdown": "# Document summary\n## Chapter 1: Limits and Continuity\n- **Key concepts**: ...",
        "reference": {
          "fileId": "file_1"
        }
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

* **配额说明**：

  * 所有文档级总结调用计入 `documentSummary`。

* **错误码**：

  * `UNAUTHORIZED`
  * `NOT_FOUND`
  * `SCANNED_PDF_UNSUPPORTED`
  * `QUOTA_EXCEEDED`
  * `INVALID_INPUT`

---

### 3.7 POST /api/ai/summarize-section — 章节级总结

* **功能**：对某一页或页区间生成总结，更适合细粒度复盘。

* **是否鉴权**：是。

* **请求体（JSON）**：

  ```ts
  {
    "courseId": string,
    "fileId": string,
    "pageRange": { "from": number; "to": number }
  }
  ```

* **响应**：

  ```json
  {
    "ok": true,
    "data": {
      "summary": {
        "title": "Section: Derivatives",
        "bullets": [
          "Definition of derivative using limits.",
          "Basic derivative rules (power rule, product rule, quotient rule)."
        ],
        "rawMarkdown": "## Section: Derivatives\n- Definition ...",
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

* **配额说明**：

  * 所有章节级总结调用计入 `sectionSummary`。

* **错误码**：

  * `UNAUTHORIZED`
  * `NOT_FOUND`
  * `SCANNED_PDF_UNSUPPORTED`
  * `PAGE_RANGE_TOO_LARGE`
  * `QUOTA_EXCEEDED`
  * `INVALID_INPUT`

---

### 3.8 POST /api/ai/summarize-course — 课程级总结 / 复习提纲

* **功能**：基于同一门课程下多份 PDF 的总结结果，生成课程提纲和高频考点列表，用于 P6「课程级复习提纲页」。

* **是否鉴权**：是。

* **请求体（JSON）**：

  ```ts
  {
    "courseId": string,
    "fileIds"?: string[] // 可选，若不提供则默认使用课程下所有 Lecture / Homework / Exam 文件
  }
  ```

* **业务规则**：

  * 建议后端优先利用已有的文档 / 章节总结缓存，而不是每次从头对所有 PDF 进行长上下文总结；
  * 如无缓存，则可在内部先触发文档级总结，再合并生成课程级总结；
  * Homework / Exam 类型文件可用于提取“典型题型 / 高频考点”。

* **响应**：

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
                "title": "Chapter 1: Limits and Continuity",
                "highFrequencyTopics": [
                  "Limit definition & notation",
                  "Continuity at a point",
                  "Common limit techniques"
                ],
                "typicalProblems": [
                  "Compute limits using algebraic manipulation",
                  "Determine continuity at a point",
                  "Use the squeeze theorem"
                ],
                "relatedFiles": [
                  { "fileId": "file_1", "page": 3 },
                  { "fileId": "file_2", "page": 10 }
                ]
              }
            ]
          }
        ],
        "rawMarkdown": "# Course outline\n## Part I: Foundations\n### Chapter 1: Limits and Continuity\n- **High-frequency topics**: ...",
        "reference": {
          "courseId": "course_1"
        }
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

* **配额说明**：

  * 所有课程级总结调用计入 `courseSummary`。

* **错误码**：

  * `UNAUTHORIZED`
  * `NOT_FOUND`
  * `QUOTA_EXCEEDED`
  * `INVALID_INPUT`

---

## 4. 配额 & 实验规则相关

### 4.1 GET /api/account/quotas

* **功能**：获取当前账号的课程数量配额与四类 AI 调用配额，用于 P7「账号配额与使用情况页」与前端按钮状态控制。

* **是否鉴权**：是。

* **响应**：

  ```json
  {
    "ok": true,
    "data": {
      "courseQuota": {
        "limit": 6,
        "used": 4,
        "remaining": 2
      },
      "aiQuotas": {
        "learningInteractions": {
          "limit": 50,
          "used": 20,
          "remaining": 30
        },
        "documentSummary": {
          "limit": 10,
          "used": 3,
          "remaining": 7
        },
        "sectionSummary": {
          "limit": 15,
          "used": 5,
          "remaining": 10
        },
        "courseSummary": {
          "limit": 3,
          "used": 1,
          "remaining": 2
        }
      }
    }
  }
  ```

* **说明**：

  * `learningInteractions`：

    * 计入：`/api/ai/explain-selection`、`/api/ai/qa`；
    * 不计入：`/api/ai/explain-page`。
  * 自动讲解（Explain this page）的限流信息通过各自接口的 `rateLimit` 字段返回，不在此处展示。

---

### 4.2 POST /api/account/check-quota（可选）

* **功能**：在调用 AI 类接口前进行配额检查（也可在各业务接口内部实现，无需对前端单独暴露）。

* **是否鉴权**：是。

* **请求体（JSON）**：

  ```ts
  {
    "bucket": "learningInteractions" | "documentSummary" | "sectionSummary" | "courseSummary"
  }
  ```

* **响应**：

  ```json
  {
    "ok": true,
    "data": {
      "bucket": "learningInteractions",
      "allowed": true,
      "limit": 50,
      "used": 20,
      "remaining": 30
    }
  }
  ```

---

## 5. 日志 & 监控（内部建议）

> 以下为内部建议，不一定暴露 HTTP API，可用日志 / APM / 监控平台完成。

### 5.1 AI 调用日志

建议记录内容：

* 用户 ID、课程 ID、文件 ID；
* 接口类型：

  * `explain-page` / `explain-selection` / `qa` / `summarize-document` / `summarize-section` / `summarize-course`；
* 请求参数摘要：

  * 页码 / 区间、问题长度、是否来自 PDF / 贴纸、是否包含公式等；
* 模型名称与版本；
* 请求 token 数、响应 token 数、总耗时；
* 是否命中配额限制或自动讲解频率限制；
* 是否失败及失败类型。

### 5.2 贴纸行为日志

建议额外记录：

* 每次贴纸创建（自动 / 手动）；
* 每次贴纸折叠 / 展开（folded 状态变化）；
* 贴纸总量随时间变化（按课程 / 文件维度）；
* 自动贴纸与手动贴纸使用比例（有利于分析用户更依赖哪种讲解方式）。

### 5.3 指标与报警

* 指标：

  * 每日 / 每周 AI 调用次数（按配额桶拆分）；
  * 自动讲解调用次数与命中限流次数；
  * 平均响应延迟、P95 延迟；
  * 错误率（按错误类型拆分）。
* 报警建议：

  * 错误率或延迟持续异常时通知维护者；
  * 当整体调用量逼近预算上限时发出内部提醒。

---

## 6. 错误码与通用响应结构

### 6.1 通用响应结构

* 成功响应：

  ```json
  {
    "ok": true,
    "data": { "... 具体内容 ..." }
  }
  ```

* 错误响应：

  ```json
  {
    "ok": false,
    "error": {
      "code": "QUOTA_EXCEEDED",
      "message": "You've reached the AI usage limit for this experiment."
    }
  }
  ```

### 6.2 错误码枚举（示例）

* **通用类**：

  * `UNAUTHORIZED`：未登录或 token 无效（HTTP 401）。
  * `FORBIDDEN`：无权访问某资源（HTTP 403）。
  * `INVALID_INPUT`：参数不合法（HTTP 400）。
  * `NOT_FOUND`：资源不存在（HTTP 404）。
  * `INTERNAL_ERROR`：服务器内部错误（HTTP 500）。

* **认证 / 用户类**：

  * `EMAIL_ALREADY_EXISTS`：注册时邮箱已存在。

* **课程 / 文件类**：

  * `COURSE_LIMIT_REACHED`：课程数量达到本期实验上限。
  * `DUPLICATE_COURSE_NAME`：同一用户下课程名重复。
  * `UNSUPPORTED_FILE_TYPE`：不支持的文件类型（非 PDF）。
  * `FILE_NAME_CONFLICT`：同一课程已有同名文件。
  * `PAGE_RANGE_TOO_LARGE`：请求的页区间过大。
  * `SCANNED_PDF_UNSUPPORTED`：该 PDF 为扫描件，当前不支持 AI 讲解。

* **贴纸类**：

  * `STICKER_NOT_FOUND`：贴纸不存在或非当前用户；
  * `STICKER_UPDATE_FORBIDDEN`：尝试修改被禁止的字段（如内容）。

* **配额 / 限流类**：

  * `QUOTA_EXCEEDED`：某一 AI 配额桶调用已达上限（learningInteractions / documentSummary / sectionSummary / courseSummary）。
  * `AUTO_EXPLAIN_LIMIT_REACHED`：自动讲解频率触达后端限流阈值（不对应用户可见配额桶）。

> 本文档为 API 草稿，后续可结合具体技术方案（如直接使用 Supabase Auth / Storage）调整鉴权方式与字段命名，但应保持与 `01_light_prd.md`、`02_page_and_flow_design.md` 中的页面与流程设计，以及 `04_tech_and_code_style.md` 中的渲染与代码规范一致，尤其是「AI 文本 / 回复格式约定」与「贴纸持久化 / 配额策略」部分。
