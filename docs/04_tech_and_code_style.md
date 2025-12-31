# 04 技术与代码规范（精简版）

> **文档定位**：技术栈、代码规范与实现约束；业务需求见01，API契约见03。

---

## 1. 技术栈（固定）

| 层次 | 技术选型 | 约束 |
|------|---------|------|
| **前端框架** | Next.js 14+ (App Router) + React 18+ + TypeScript 5.3+ | 统一使用App Router |
| **样式** | Tailwind CSS | 少量自定义CSS |
| **组件库** | Headless UI / Radix UI | 仅用于无锁定样式的交互组件 |
| **图标** | Heroicons 或 Lucide | 统一来源，不混用 |
| **状态管理** | React局部状态 + TanStack Query | MVP不引入Redux/MobX |
| **BaaS** | Supabase (Auth + Postgres + Storage) | **仅server-side使用SDK** |
| **LLM** | OpenAI API | **仅server-side调用** |
| **包管理** | pnpm | 不混用npm/yarn |
| **部署目标** | Vercel 或支持Next.js的托管平台 | - |

---

## 2. 关键依赖版本

### 2.1 核心框架

```json
{
  "dependencies": {
    "next": "^14.1.0",
    "react": "^18.2.0",
    "typescript": "^5.3.0"
  }
}
```

### 2.2 Supabase集成（Server-Side Only）

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.39.0",
    "@supabase/ssr": "^0.1.0"
  }
}
```

**约束**：
* 使用`@supabase/ssr`包处理App Router的server-side auth
* **禁止**在前端组件中直接导入`@supabase/supabase-js`

### 2.3 OpenAI集成

```json
{
  "dependencies": {
    "openai": "^4.28.0"
  }
}
```

**模型配置**：

| 功能 | 模型 | 原因 |
|------|------|------|
| 自动讲解 | `gpt-4-turbo-preview` | 需理解长上下文（单页2-3k tokens） |
| 选中讲解 | `gpt-4` | 平衡质量与成本 |
| 问答 | `gpt-4-turbo-preview` | 需检索整份PDF |
| 文档总结 | `gpt-4-turbo-preview` | 需128K context window |
| 章节总结 | `gpt-3.5-turbo-16k` | 成本优化 |
| 课程提纲 | `gpt-4-turbo-preview` | 需整合多份文档 |

**Streaming配置**：
* 启用接口：explain-page / explain-selection / qa
* 目标：首token延迟<2s，完整响应<10s

### 2.4 PDF处理

**前端渲染**：
```json
{
  "dependencies": {
    "react-pdf": "^7.7.0",
    "pdfjs-dist": "^3.11.174"
  }
}
```

**服务端解析**：
```json
{
  "dependencies": {
    "pdf-parse": "^1.1.1",
    "pdf-lib": "^1.17.1"
  }
}
```

**扫描件检测逻辑**：
```typescript
// lib/pdf-utils.ts
export async function detectScannedPdf(buffer: Buffer): Promise<boolean> {
  const data = await pdf(buffer, { max: 3 })  // 只解析前3页
  const avgCharsPerPage = data.text.length / Math.min(data.numpages, 3)
  return avgCharsPerPage < 50  // <50字符/页视为扫描件
}
```

### 2.5 Markdown与LaTeX渲染

```json
{
  "dependencies": {
    "react-markdown": "^9.0.1",
    "remark-math": "^6.0.0",
    "remark-gfm": "^4.0.0",
    "rehype-katex": "^7.0.0",
    "katex": "^0.16.9"
  }
}
```

**注意**：
* `react-markdown` v9.x为ESM-only，需Next.js 14+支持
* KaTeX CSS需全局导入：`import 'katex/dist/katex.min.css'`

### 2.6 代码语法高亮

```json
{
  "dependencies": {
    "prism-react-renderer": "^2.3.1"
  }
}
```

### 2.7 状态管理与数据获取

```json
{
  "dependencies": {
    "@tanstack/react-query": "^5.20.0",
    "@tanstack/react-query-devtools": "^5.20.0"
  }
}
```

---

## 3. Supabase集成方式（Server-Side Auth）

### 3.1 认证流程架构

**不使用**：传统session表 + 自定义Cookie

**采用**：Supabase Server-Side Auth
* Supabase签发JWT (access token 1h + refresh token 7d)
* 通过`@supabase/ssr`将token存储在**httpOnly cookie**中
* Next.js middleware和Route Handlers中使用`createServerClient`读取cookie并自动刷新token

### 3.2 Cookie配置

* **名称**：`sb-<project-ref>-auth-token`（Supabase自动生成）
* **属性**：`HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`
* **前端约束**：无需（也不应该）手动操作此cookie

### 3.3 服务端Client创建

```typescript
// lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) { return cookieStore.get(name)?.value },
        set(name, value, options) { cookieStore.set({ name, value, ...options }) },
        remove(name, options) { cookieStore.set({ name, value: '', ...options }) },
      },
    }
  )
}
```

### 3.4 Middleware中的会话刷新

```typescript
// middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } })
  const supabase = createServerClient(/* ... */)
  await supabase.auth.getUser()  // 自动刷新session
  return response
}
```

### 3.5 前端约束

* 调用`/api/*`时使用`credentials: 'include'`
* 浏览器自动携带httpOnly cookie
* **禁止**在前端读取/存储token（不用localStorage/sessionStorage）

**参考文档**：
* [Supabase Server-Side Auth for Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs)
* [@supabase/ssr Package](https://github.com/supabase/auth-helpers/tree/main/packages/ssr)

---

## 4. 前端目录结构

```
/src
  /app
    /(public)           # 公共路由：/login, /register
    /(app)              # 业务路由：/courses, /courses/[courseId], ...
    /api                # Route Handlers：/api/courses/route.ts, ...
    /auth/callback      # 邮箱验证回调（非/api路径）
  /components           # 通用UI组件：Button, Input, Dialog, ...
  /features             # 业务模块
    /auth               # 登录/注册表单与hooks
    /courses            # 课程列表、卡片、创建/删除
    /files              # PDF列表、上传
    /reader             # PDF阅读器（左侧）
    /ai                 # AI面板、贴纸、问答、总结（右侧）
    /usage              # 配额展示
  /lib                  # 通用工具函数、API封装、BaaS SDK封装
  /types                # 全局类型定义：User, Course, File, Sticker, ...
  /config               # 环境变量读取与配额配置
  /tests                # 前端单元测试/组件测试
```

**模块内部结构示例**：
```
/features/ai
  /components         # AI面板、贴纸列表、问答输入等
  /hooks              # useExplainPage, useExplainSelection, ...
  /api                # explainPage(), explainSelection(), askQuestion(), ...
  /types              # Sticker, AiResponse, ...
```

---

## 5. TypeScript与代码规范

### 5.1 语言设置

* 全项目使用TypeScript，禁用`.js`业务代码
* `strict`模式开启，避免`any`滥用

**tsconfig基础设置**：
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "baseUrl": "src"
  }
}
```

### 5.2 ESLint + Prettier

* 使用`eslint-config-next` + `@typescript-eslint`
* 使用Prettier格式化，开启`eslint-config-prettier`避免冲突
* CI中执行`pnpm lint`和`pnpm test`

### 5.3 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 组件/类名 | PascalCase | `CourseCard`, `PdfReader`, `AiPanel` |
| 函数/变量 | camelCase | `fetchCourses`, `handleSubmit` |
| Hooks | use开头 | `useCourseList`, `useAiExplainPage` |
| 常量/枚举 | UPPER_SNAKE_CASE | `COURSE_LIMIT`, `AI_QUOTA_BUCKETS` |
| 组件文件 | kebab-case | `course-card.tsx`, `pdf-reader.tsx` |
| Hook文件 | use-xxx.ts | `use-course-list.ts` |
| 类型文件 | *.types.ts | `course.types.ts` |

### 5.4 文件与函数大小

* **单文件**：≤300行，超过时拆分
* **单函数**：≤50行，保持单一职责
* **React组件**：只负责一层UI+简单状态，复杂逻辑下沉到hooks/lib

---

## 6. React/Next.js使用约定

### 6.1 组件粒度

* **页面级组件**（page）：只负责路由与业务模块组合
* **复用型视图**：抽成`features/*/components`
* **通用组件**：仅在有需要时抽到`/components`

### 6.2 Hooks使用

* 业务数据获取用`useQuery`/`useMutation`，统一封装在`features/*/api`或`features/*/hooks`
* 避免在组件中直接写`fetch`，统一走封装的API client

### 6.3 服务端/客户端划分

* 默认使用客户端组件（需浏览器交互）
* 与SEO相关或可SSR的页面再考虑server component
* Route Handlers只返回JSON，不返回React组件

### 6.4 路由与导航

* 使用App Router（`/app`目录），不使用pages Router
* 导航使用`next/link` + `useRouter`（仅必要时编程式导航）

---

## 7. 数据访问、错误处理与配额

### 7.1 API封装

**基础封装**（`/lib/api-client.ts`）：
* 统一处理：`credentials: "include"`、错误码解析、超时
* **不要**在前端处理/拼接`Authorization`头
* **不要**把任何token写入localStorage/sessionStorage

**鉴权失败处理**：
* 401 → 清理前端user状态 + 跳转登录页
* 必要时调用`/api/auth/logout`触发服务端清Cookie

**AI类接口封装**（`features/ai/api`）：
```typescript
// 语义化函数，隐藏底层HTTP细节
export async function explainPage({ courseId, fileId, page }: ExplainPageParams) {
  return fetchJson('/api/ai/explain-page', { method: 'POST', body: { courseId, fileId, page } })
}

export async function explainSelection({ ... }: ExplainSelectionParams) { /* ... */ }
export async function askQuestion({ ... }: AskQuestionParams) { /* ... */ }
export async function summarizeDocument({ ... }: SummarizeDocumentParams) { /* ... */ }
```

### 7.2 与BaaS的交互

* 在server端Route Handlers中使用**Supabase SDK**（Auth + Postgres + Storage）
* **禁止**前端直接依赖/调用Supabase SDK
* 前端只感知业务API（`/api/*`），不直接依赖BaaS

### 7.3 错误处理约定

| 错误类型 | HTTP | 前端行为 |
|---------|------|---------|
| 鉴权失败 | 401 | 清理状态 + 跳转登录 |
| 资源不存在 | 404 | 显示"Not found"状态 |
| 配额触顶 | 429 + `QUOTA_EXCEEDED` | 提示"配额已用尽" + 更新配额状态 |
| 自动讲解限流 | 429 + `AUTO_EXPLAIN_LIMIT_REACHED` | 仅针对"Explain this page"按钮降级 |
| 其他错误 | - | 统一toast或错误区域 |

### 7.4 配额检查

**服务端统一检查**：
* AI类API返回统一错误结构：`code: "QUOTA_EXCEEDED"`, `bucket: "learningInteractions"`, ...
* "Explain this page"不占用户可见配额，前端根据`rateLimit`字段提示

**LLM调用约定**：
* AI接口统一由server-side Route Handlers调用OpenAI API
* OpenAI API Key仅存在服务端环境变量（`OPENAI_API_KEY`）
* 前端永远只调用`/api/ai/*`

---

## 8. 配额与限流配置管理

### 8.1 配置文件结构

```typescript
// src/config/quotas.ts
export const QUOTA_CONFIG = {
  courses: {
    limit: parseInt(process.env.COURSE_LIMIT || '6'),
  },
  ai: {
    learningInteractions: {
      limit: parseInt(process.env.AI_LEARNING_LIMIT || '50'),
      perCourse: true,
    },
    documentSummary: {
      limit: parseInt(process.env.AI_DOC_SUMMARY_LIMIT || '10'),
      perCourse: true,
    },
    sectionSummary: {
      limit: parseInt(process.env.AI_SECTION_SUMMARY_LIMIT || '15'),
      perCourse: true,
    },
    courseSummary: {
      limit: parseInt(process.env.AI_COURSE_SUMMARY_LIMIT || '3'),
      perCourse: true,
    },
  },
  autoExplain: {
    perFileDailyLimit: parseInt(process.env.AUTO_EXPLAIN_FILE_DAILY || '20'),
    maxStickersPerRequest: 6,
    timezone: 'UTC',
  },
} as const
```

### 8.2 环境变量清单

```bash
# .env.local

# === Supabase ===
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...  # 仅服务端

# === OpenAI ===
OPENAI_API_KEY=sk-...
OPENAI_ORG_ID=org-...  # 可选

# === 配额配置 ===
COURSE_LIMIT=6
AI_LEARNING_LIMIT=50
AI_DOC_SUMMARY_LIMIT=10
AI_SECTION_SUMMARY_LIMIT=15
AI_COURSE_SUMMARY_LIMIT=3
AUTO_EXPLAIN_FILE_DAILY=20

# === 功能开关 ===
ENABLE_AUTO_EXPLAIN=true
ENABLE_STREAMING=true

# === 监控 ===
SENTRY_DSN=https://...  # 可选
```

---

## 9. UI组件与样式约定

### 9.1 Tailwind使用

* 优先使用Tailwind工具类
* 复用度高的样式抽成组件或封装为`className`帮助函数
* 避免JSX中出现过长class串（>1-2行），拆到子组件

### 9.2 AI面板与贴纸组件

**组件拆分**：
* `AiPanel`：整体容器，上下区域拆分
* `StickerList`：贴纸列表（自动+手动）
* `StickerItem`：单条贴纸（折叠/展开、内部滚动）
* `QaPanel` / `QaHistory` / `QaInput`：问答与总结区

**贴纸组件要求**：
* 支持`auto`/`manual`两种类型的样式差异（不同背景色/标签）
* 支持折叠/展开状态（`folded`字段）
* 内部滚动（`max-height` + `overflow-auto`）

### 9.3 交互细节

* 按钮/链接需有明确的hover/active/disabled状态
* 所有可点击区域在键盘导航与屏幕阅读器下可用（后续完善a11y）
* 贴纸与PDF联动通过回调props实现：`onJumpToPage(page, anchorRect?)`

---

## 10. 性能优化与监控

### 10.1 性能基线

| 指标 | 目标值 | 测试条件 |
|------|--------|---------|
| PDF首屏(LCP) | <3s (P75) | Fast 3G + 4x CPU throttling |
| AI首token(TTFB) | <5s (P75) | 从请求到首响应 |

### 10.2 PDF渲染优化

**基础渲染**：
* 默认分页模式（page-by-page），避免一次性渲染全部
* 每页独立渲染到Canvas，避免DOM节点过多
* 使用`react-pdf`懒加载特性

**大型PDF优化（>50页）**：
* 启用虚拟滚动（`react-window` / `react-virtualized`）
* 仅渲染可见页 ± 2页
* 滚动时动态卸载远离视口的页面

**贴纸加载联动**：
* 初始只请求"当前页 ± 2页"的贴纸
* 滚动时触发增量加载：
  ```typescript
  useEffect(() => {
    const visiblePages = getVisiblePages()  // [3, 4, 5]
    const pagesToLoad = expandRange(visiblePages, 2)  // [1-7]
    const missingPages = pagesToLoad.filter(p => !loadedStickers.has(p))
    if (missingPages.length > 0) {
      fetchStickers({ fileId, pages: missingPages })
    }
  }, [currentPage])
  ```
* 使用React Query的`staleTime`避免重复请求

**缓存策略**：
* 已渲染Canvas缓存在内存（LRU淘汰）
* PDF文件通过Service Worker缓存
* 贴纸数据通过React Query缓存（5分钟staleTime）

### 10.3 AI响应超时处理

* **理想**：使用streaming，首token<2s，逐字显示
* **超时处理**：
  * 15s未完成 → 显示"AI正在处理..."+ "取消"按钮
  * 30s仍未完成 → 自动超时 + 提示"请求超时，请稍后重试"

### 10.4 监控与埋点

**前端监控**（前端至少记录）：
* AI调用失败基础信息（接口、错误码、耗时）
* 关键路径埋点（explain-page / explain-selection / qa / summarize-*）
* 性能指标：
  ```typescript
  import { onLCP, onINP, onTTFB } from 'web-vitals'
  onLCP(console.log)  // Largest Contentful Paint
  onINP(console.log)  // Interaction to Next Paint
  onTTFB(console.log) // Time to First Byte
  ```

**后端监控**（建议集中在`features/ai`）：
* AI调用日志：userId/courseId/fileId、接口类型、token数、耗时、是否触发配额/限流
* 贴纸行为：创建、折叠/展开、自动与手动使用比例

---

## 11. AI回复格式渲染（统一）

### 11.1 Markdown渲染组件

**位置**：`/src/components/markdown-renderer.tsx`

**基于**：
* `react-markdown`：Markdown解析
* `remark-math` + `remark-gfm`：数学公式+GitHub风格
* `rehype-katex`：LaTeX渲染
* `prism-react-renderer`：代码高亮

**全局导入**：
```typescript
// app/layout.tsx
import 'katex/dist/katex.min.css'
```

### 11.2 LaTeX数学公式

* **行内**：`$...$` 或 `\(...\)`
* **块级**：`$$...$$` 或 `\[...\]`
* 使用KaTeX渲染，要求AI回复中公式语法符合KaTeX能力范围

### 11.3 代码语法高亮

* 使用`prism-react-renderer`，主题：`vsLight`或类似浅色主题
* 代码块：三反引号+语言标记（` ```python`、` ```javascript`等）
* 行内代码：单反引号，渲染为等宽字体+浅背景

### 11.4 使用约定

**所有AI相关展示统一使用`MarkdownRenderer`**：
* 自动讲解贴纸（Explain this page）
* 选中文本讲解贴纸（From selection / 追问链）
* 基于当前PDF的问答回答
* 文档总结 / 章节总结 / 课程级提纲

**约束**：
* 不直接渲染`innerHTML`
* 接收后端返回的**纯文本Markdown字符串**
* 若新增AI能力，优先复用或扩展该组件
* 与01/03文档中"AI文本格式约定"保持一致

---

## 12. 国际化（i18n）准备

* MVP不做多语言切换
* 用户可见文案集中管理（`/config/texts.ts`或简单i18n文件）
* 避免在多个组件中重复硬编码相同文案

---

> **本规范为MVP阶段基线**。后续如团队规模或功能复杂度上升，可在此基础上补充更细致的组件设计规范、更严格的测试覆盖率目标，但应始终保持与01 PRD / 03 API文档的设计一致。
