# 04 技术与代码规范（精简版 v4.0）

> **文档定位**：技术栈基线、代码规范与安全红线。业务需求见01，API契约见03。
> **关键词定义**：MUST=必须 | SHOULD=建议 | MAY=可选 | MUST NOT=禁止

---

## 1. 技术基线

### 1.1 核心技术栈

| 层次 | 技术选型 | 版本约束 | 规范级别 |
|------|---------|---------|---------|
| 前端框架 | Next.js (App Router) + React + TS | ≥14.0/18.0/5.3 | MUST |
| 样式 | Tailwind CSS | latest | SHOULD避免自定义CSS |
| 组件库 | Headless UI / Radix UI | latest | MAY |
| 状态管理 | React局部状态 + TanStack Query | latest | MUST NOT引入Redux/MobX |
| 国际化 | next-intl | latest | MUST（支持en/zh） |
| BaaS | Supabase (Auth + Postgres + Storage) | ≥2.39.0 | MUST仅server-side |
| LLM | OpenAI API | ≥4.28.0 | MUST仅server-side |
| 包管理 | pnpm | latest | MUST NOT混用npm/yarn |

### 1.2 OpenAI模型策略

| 功能 | 模型 | 原因 |
|------|------|------|
| 自动讲解/问答/文档总结 | `gpt-4-turbo-preview` | 128K context |
| 选中讲解 | `gpt-4` | 质量优先 |
| 章节总结 | `gpt-3.5-turbo-16k` | 成本优化 |
| 上下文提取 | `gpt-4o-mini` | 批量处理 |

**Streaming**：
- MUST启用：`explain-page`, `explain-selection`, `qa`
- 目标：首token<2s，完整响应<10s
- 配额规则：首token返回即扣配额（不退还）

### 1.3 PDF处理

| 组件 | 依赖 | 版本 |
|------|------|------|
| 前端渲染 | `react-pdf` + `pdfjs-dist` | ^7.7.0 / ^3.11.174 |
| 虚拟滚动 | `react-window` | ^1.8.10 |
| 服务端解析 | `pdf-parse` + `pdf-lib` | ^1.1.1 / ^1.17.1 |

**检测规则**：
```
扫描件: avgCharsPerPage < 50
PPT类型: avgCharsPerPage < 500 OR avgWordsPerPage < 100 OR imageRatio > 0.6
```

**上下文提取（v2.0）**：
- 模型：`gpt-4o-mini`
- 分批：3000-5000词/批，重叠100词
- 阈值：relevanceScore ≥ 0.7
- 超时：单批30s，总时长5min
- MUST支持断点续传

### 1.4 Markdown与LaTeX渲染

依赖：`react-markdown` ^9.0.1 + `remark-math` ^6.0.0 + `remark-gfm` ^4.0.0 + `rehype-katex` ^7.0.0

**MUST**：全局导入 `import 'katex/dist/katex.min.css'`

### 1.5 Rate Limiting

| 端点 | 维度 | 限制 | 窗口 |
|------|------|------|------|
| `/api/auth/resend-confirmation` | Email+IP | 5/Email, 10/IP | 15min/1h |
| `/api/courses/:id/files/:id/images/feedback` | User | 10次 | 1h |
| `/api/internal/worker/run` | IP | 60次 | 1h |

**MUST**：返回429时附带 `Retry-After` 和 `X-RateLimit-*` 头

---

## 2. Supabase认证规范

### 2.1 架构要点

| 项目 | 规范 |
|------|------|
| SDK包 | `@supabase/ssr`（MUST使用） |
| Token存储 | httpOnly cookie（详见§10.2） |
| Client创建 | `createServerClient`（模板见附录A.1） |
| 前端约束 | MUST使用`credentials: 'include'`调用API |

### 2.2 Middleware

**MUST实现**：
- 调用`supabase.auth.getSession()`刷新token
- 认证失败：API→401 / 页面→重定向`/login?error=session_expired`
- Supabase异常→503

**Matcher**：`['/courses/:path*', '/account/:path*', '/api/:path*']`

---

## 3. 目录结构与模块边界

### 3.1 目录结构

```
/src
  /app
    /(public), /(app)    # 路由组
    /api                  # BFF层Route Handlers
    /auth/callback        # 邮箱验证回调
  /components             # 通用UI组件
  /features               # 业务模块（auth/courses/files/reader/stickers/qa/usage）
  /lib                    # 工具函数、BaaS封装
  /i18n                   # 国际化
  /types                  # 全局类型
  /config                 # 环境变量与配额配置
```

### 3.2 依赖规则（单一真相）

**依赖方向**（单向，从上到下）：
```
/app/api → /lib → /types
          ↘ /features → /components → /types
```

| MUST NOT | 原因 |
|----------|------|
| `/lib` → `/features` | 通用工具不依赖业务 |
| `/components` → `/features` | 通用组件不依赖业务 |
| `/features/X` → `/features/Y` | 业务模块间禁止直接依赖 |
| 前端导入`@supabase/supabase-js` | 仅允许server-side使用 |

**跨feature通信**：✅ 通过`/lib`共享服务或URL参数

**循环依赖检测**：`pnpm check:circular`（CI必须通过）

---

## 4. TypeScript与ESLint

### 4.1 TypeScript配置

| 选项 | 值 | 级别 |
|------|---|------|
| `strict` | true | MUST |
| `noImplicitAny` | true（strict包含） | MUST |
| `noUnusedLocals` | true | SHOULD |
| `noUnusedParameters` | true | SHOULD |
| `noUncheckedIndexedAccess` | true | SHOULD |

**MUST**：全项目使用TypeScript，禁用`.js`业务代码

完整配置见附录B.1

### 4.2 ESLint配置

核心规则：
- `no-console`: warn（允许warn/error）
- `@typescript-eslint/no-explicit-any`: warn
- `@typescript-eslint/consistent-type-imports`: error
- `import/order`: 分组排序

完整配置见附录B.2

### 4.3 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 组件/类 | PascalCase | `CourseCard` |
| 函数/变量 | camelCase | `fetchCourses` |
| Hooks | use前缀 | `useCourseList` |
| 常量/枚举 | UPPER_SNAKE | `COURSE_LIMIT` |
| 组件文件 | kebab-case | `course-card.tsx` |

### 4.4 文件与函数限制

- 单文件 SHOULD ≤300行
- 单函数 SHOULD ≤50行
- React组件仅负责UI，复杂逻辑下沉到hooks/lib

---

## 5. React/Next.js约定

| 规则 | 级别 |
|------|------|
| 页面组件仅负责路由与模块组合 | MUST |
| 数据获取使用`useQuery`/`useMutation`，封装在`features/*/api` | MUST |
| 组件中禁止直接写`fetch` | MUST NOT |
| 默认客户端组件，SEO相关再用server component | SHOULD |
| Route Handlers只返回JSON | MUST |

---

## 6. 错误处理

### 6.1 响应格式

```typescript
// 成功
{
  ok: true,
  data: {...},
  traceId: "550e8400-e29b-41d4-a716-446655440000",  // UUID v4，服务端生成
  timestamp: "2025-01-10T10:00:00Z"                  // ISO 8601格式
}
// 失败
{
  ok: false,
  error: { code: "ERROR_CODE", message: "...", details?: {...} },
  traceId: "550e8400-e29b-41d4-a716-446655440000",
  timestamp: "2025-01-10T10:00:00Z"
}
```

**MUST**：所有API响应必须包含`traceId`和`timestamp`字段，便于日志追踪和调试

### 6.2 标准错误码

| 错误码 | HTTP | 前端行为 |
|--------|------|---------|
| `UNAUTHORIZED` | 401 | 清理状态+跳转登录 |
| `NOT_FOUND` | 404 | 显示Not found |
| `QUOTA_EXCEEDED` | 403 | 提示配额用尽 |
| `RATE_LIMIT_EXCEEDED` | 429 | 显示重试时间 |
| `INVALID_INPUT` | 400 | 显示字段错误 |
| `INTERNAL_ERROR` | 500 | 通用错误提示 |

### 6.3 API封装（`/lib/api-client.ts`）

**MUST**：统一处理`credentials: "include"`, 错误解析, 超时
**MUST NOT**：前端处理Authorization头 / 使用localStorage存token

---

## 7. 环境变量

### 7.1 变量清单

| 分类 | 变量名 | 级别 |
|------|-------|------|
| **Supabase** | `NEXT_PUBLIC_SUPABASE_URL` | MUST |
| | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | MUST |
| | `SUPABASE_SERVICE_ROLE_KEY` | MUST |
| **OpenAI** | `OPENAI_API_KEY` | MUST |
| **Worker/Admin** | `WORKER_SECRET` (≥32字符) | MUST |
| | `ADMIN_SECRET` (≥32字符) | MUST |
| **Vercel KV** | `KV_REST_API_URL`, `KV_REST_API_TOKEN` | SHOULD |

### 7.2 管理策略

**优先级**（高→低）：系统环境变量 > `.env.local` > `.env.production` > `.env`

**MUST**：
- 提供`.env.example`模板
- 生产环境启动时调用`validateServerEnv()`
- 验证URL格式、密钥长度（≥32字符）

验证schema见附录A.4

---

## 8. 配额配置（`/config/quotas.ts`）

```typescript
export const QUOTA_CONFIG = {
  courses: { limit: 6 },
  ai: {
    learningInteractions: { limit: 150, resetMonthly: true },
    documentSummary: { limit: 100, resetMonthly: true },
    sectionSummary: { limit: 65, resetMonthly: true },
    courseSummary: { limit: 15, resetMonthly: true },
  },
  autoExplain: {
    limit: 300,
    resetMonthly: true,
    // PPT风格: 每页1个全页贴纸
    pptMaxStickersPerPage: 1,
    // 文本密集型: 每页2-6个段落贴纸
    textMaxStickersPerPage: 6,
    // 窗口生成优先级: 当前页 → +1 → -1 → +2 → +3 → -2 → +4 → +5
    // 优先生成用户最可能阅读的页面
  },
} as const
```

配额数值详见01_PRD §3.1

---

## 9. UI组件

### 9.1 Tailwind使用

- MUST：优先utility classes，复杂样式用`@layer components`
- SHOULD：避免内联style（动态计算除外）

### 9.2 P5页面核心组件

| 组件 | 位置 | 说明 |
|------|------|------|
| `PdfViewer` | 左栏40-50% | PDF阅读器 |
| `StickerPanel` | 中栏25-30% | 贴纸+版本切换 |
| `QaPanel` | 右栏25-30% | 问答与总结 |
| `ResizableLayout` | 容器 | 拖拽+localStorage持久化 |

---

## 10. 安全红线

### 10.1 输入验证（Zod）

**MUST**：
- 所有Route Handler使用Zod验证
- 文件上传验证：大小≤50MB、MIME类型、扩展名、文件名（防路径遍历）

模板见附录A.3

### 10.2 Cookie安全

| 属性 | 值 | 说明 |
|------|---|------|
| httpOnly | true | 防XSS |
| secure | true | 仅HTTPS（生产） |
| sameSite | lax | CSRF保护 |
| maxAge | 2592000 | 30天 |

**MUST NOT**：`document.cookie`读写token / localStorage存储token

### 10.3 SQL/XSS防护

| 攻击类型 | 防护措施 | 级别 |
|---------|---------|------|
| SQL注入 | 使用Supabase查询构建器，启用RLS | MUST |
| XSS | 依赖React自动转义，禁止`dangerouslySetInnerHTML` | MUST |
| CORS | 生产环境仅允许同源 | MUST |

### 10.4 CSP配置

见附录A.5

### 10.5 依赖安全

```bash
pnpm audit                    # 检查漏洞
pnpm audit --audit-level=high # 仅高危
```

**漏洞响应SLA**：

| 严重程度 | 响应时间 | 修复时间 |
|---------|---------|---------|
| Critical | 1小时 | 24小时 |
| High | 4小时 | 72小时 |
| Medium | 1天 | 1周 |

---

## 11. 国际化(i18n)

### 11.1 配置

- 语言：en（默认）, zh
- 翻译文件：`/src/i18n/messages/{locale}.json`
- 检测顺序：URL参数 > Cookie > Accept-Language > en

### 11.2 使用规范

**MUST**：使用翻译键`t('courses.create')`
**MUST NOT**：硬编码文案 / 拼接字符串

**AI内容**：Prompt添加`Please respond in {locale language}`

---

## 12. 数据收集

### 12.1 允许收集

- 轻量行为标记：`has_used_auto_explain`, `has_used_manual_explain`
- PDF内容Hash（跨用户去重）
- 审计日志：登录与关键动作
- AI成本：model, tokens, cost_usd_approx, latency_ms

### 12.2 禁止收集

**MUST NOT**：完整IP / 设备指纹 / Google Analytics / 详细点击流

### 12.3 账户删除

**MUST**：提供`DELETE /api/account`，级联删除所有用户数据

---

## 13. Worker与定时任务

### 13.1 Cron配置

```json
// vercel.json
{ "crons": [
  { "path": "/api/internal/worker/run", "schedule": "*/2 * * * *" },
  { "path": "/api/internal/quota/reset", "schedule": "0 0 * * *" }
]}
```

### 13.2 Worker参数

| 参数 | Context Worker | Sticker Worker |
|------|---------------|---------------|
| `BATCH_SIZE` | 5 | 10 |
| `RUNTIME_BUDGET_MS` | 55000 | 50000 |
| `LOCK_TIMEOUT_MINUTES` | 5 | 2 |
| `MAX_ATTEMPTS` | 3 | 3 |

**MUST实现**：断点续传、僵尸检测（超时→'zombie'）

**告警阈值**：`stuck_jobs > 0` → WARNING | `last_run_at > 10min` → CRITICAL

---

## 14. 管理员访问

### 14.1 认证

- 验证头：`x-admin-secret: <ADMIN_SECRET>`
- 前端存储：`sessionStorage`（标签页关闭清除）

### 14.2 权限边界

| 允许 | 禁止 |
|------|------|
| 访问`/api/admin/*` | 修改用户数据 |
| 查看全局聚合数据 | 查看用户PDF内容 |
| 系统监控指标 | 访问敏感信息 |

**MUST**：所有管理员操作记录到`audit_logs`

---

## 15. 性能

### 15.1 基线目标

| 指标 | 目标 |
|------|------|
| PDF首屏(LCP) | <3s |
| 翻页响应 | <100ms P90 |
| AI首token | <5s P75 |
| 首页JS(gzip) | <150KB |

### 15.2 优化要求

| 场景 | 措施 | 级别 |
|------|------|------|
| >50页PDF | `react-window`虚拟滚动 | MUST |
| AI响应 | Streaming，15s显示取消按钮 | MUST |
| 大型依赖(PDF.js) | dynamic import | MUST |
| 图片 | Next.js Image组件 | MUST |

### 15.3 React Query配置

```typescript
staleTime: 5 * 60 * 1000      // 5分钟
gcTime: 10 * 60 * 1000        // 10分钟
refetchOnWindowFocus: false
retry: 3
```

---

## 16. 测试

### 16.1 框架

| 类型 | 工具 | 目标覆盖率 |
|------|------|-----------|
| 单元/集成 | Vitest + Testing Library | ≥70% |
| E2E | Playwright | 核心流程100% |

### 16.2 命令

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "test:e2e": "playwright test",
  "test:ci": "vitest run --coverage && playwright test"
}
```

### 16.3 质量门禁（PR合并前MUST通过）

- [ ] `pnpm typecheck` 通过
- [ ] `pnpm lint` 无错误
- [ ] `pnpm check:circular` 无循环依赖
- [ ] 单元测试覆盖率≥70%
- [ ] E2E核心流程通过

---

## 17. Git工作流

### 17.1 分支策略（Trunk-Based）

| 类型 | 命名 | 生命周期 |
|------|------|---------|
| 主分支 | `main` | 永久，始终可部署 |
| 特性 | `feat/<description>` | ≤3天 |
| 修复 | `fix/<issue>-<description>` | ≤3天 |
| 紧急 | `hotfix/<description>` | 直接合并main |

### 17.2 Commit规范（Conventional Commits）

格式：`<type>(<scope>): <description>`

| Type | 说明 |
|------|------|
| feat | 新功能 |
| fix | Bug修复 |
| refactor | 重构 |
| perf | 性能优化 |
| test | 测试 |
| chore | 构建/工具 |

**MUST**：祈使语气、首字母小写、≤72字符、无句号

### 17.3 PR流程

- 模板：`.github/pull_request_template.md`（见附录C.1）
- CODEOWNERS：`.github/CODEOWNERS`
- 版本号：Semantic Versioning (MAJOR.MINOR.PATCH)

---

## 18. CI/CD

### 18.1 GitHub Actions

完整配置见附录C.2

核心Jobs：
1. **quality**：typecheck + lint + format:check + circular check
2. **test**：coverage上传Codecov
3. **e2e**：Playwright测试
4. **security**：pnpm audit

### 18.2 Vercel部署

```json
// vercel.json
{
  "buildCommand": "pnpm build",
  "installCommand": "pnpm install --frozen-lockfile",
  "regions": ["hnd1"]
}
```

### 18.3 环境隔离

| 环境 | Supabase项目 | 触发条件 |
|------|-------------|---------|
| development | studentaid-dev | 手动 |
| preview | studentaid-dev | PR创建 |
| production | studentaid-prod | main合并 |

---

## 19. 可观测性

### 19.1 日志规范

**MUST**：
- 结构化JSON格式（生产环境）
- 脱敏处理敏感字段（email, password, token, secret）
- 包含requestId用于追踪

实现见附录A.6

### 19.2 监控告警

| 指标 | 告警阈值 |
|------|---------|
| P95响应时间 | >1000ms |
| 错误率 | >5% |
| 请求量突增 | 300% |

### 19.3 Sentry配置

- 采样率：traces 10%, replays 10%
- 过滤：ChunkLoadError, ResizeObserver loop

---

## 20. 格式化工具

### 20.1 Prettier

```json
// .prettierrc
{
  "semi": false,
  "singleQuote": true,
  "tabWidth": 2,
  "printWidth": 100,
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

### 20.2 Pre-commit Hooks

```bash
pnpm add -D husky lint-staged
pnpm exec husky init
```

配置：`.lintstagedrc.json`（见附录B.3）

---

## 21. 快速上手

### 21.1 环境搭建

```bash
# 1. 前置要求：Node 20+ / pnpm 8+
# 2. 克隆并安装
git clone <repo> && cd student-aid
pnpm install
# 3. 配置环境变量
cp .env.example .env.local
# 4. 启动
pnpm dev
```

### 21.2 常见问题

| 问题 | 解决方案 |
|------|---------|
| `pnpm install`失败 | `rm -rf node_modules pnpm-lock.yaml && pnpm install` |
| TS报错但代码正确 | VSCode: Cmd+Shift+P > Restart TS Server |
| PDF渲染空白 | 检查pdfjs-dist版本与react-pdf匹配 |

### 21.3 反模式清单

| 禁止 | 正确做法 |
|------|---------|
| 前端调用Supabase SDK | 通过`/api/*`路由 |
| 组件中写`fetch` | 使用`useQuery`/`useMutation` |
| localStorage存token | 依赖httpOnly cookie |
| 硬编码UI文案 | i18n翻译键 |
| 使用`any`类型 | 定义明确类型 |

---

## 附录

### A.1 Supabase Server Client

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
        set(name, value, options) { cookieStore.set(name, value, options) },
        remove(name, options) { cookieStore.set(name, '', options) },
      },
    }
  )
}
```

### A.2 MarkdownRenderer组件

```typescript
// components/ui/markdown-renderer.tsx
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import remarkGfm from 'remark-gfm'
import rehypeKatex from 'rehype-katex'

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath, remarkGfm]}
      rehypePlugins={[rehypeKatex]}
      disallowedElements={['script', 'iframe', 'object', 'embed']}
      unwrapDisallowed={true}
    >
      {content}
    </ReactMarkdown>
  )
}
```

### A.3 Zod验证示例

```typescript
// Route Handler使用
import { z } from 'zod'
import { errors, successResponse } from '@/lib/api-response'

const schema = z.object({
  name: z.string().min(1).max(100),
})

export async function POST(request: NextRequest) {
  const body = await request.json()
  const result = schema.safeParse(body)
  if (!result.success) {
    return errors.invalidInput(result.error.errors[0].message)
  }
  // ...业务逻辑
}
```

### A.4 环境变量验证Schema

```typescript
// lib/env.ts
import { z } from 'zod'

const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(32),
  OPENAI_API_KEY: z.string().startsWith('sk-'),
  WORKER_SECRET: z.string().min(32),
  ADMIN_SECRET: z.string().min(32),
})

export function validateServerEnv() {
  const result = serverEnvSchema.safeParse(process.env)
  if (!result.success && process.env.NODE_ENV === 'production') {
    throw new Error('Invalid server environment variables')
  }
  return result.data
}
```

### A.5 CSP配置

```javascript
// next.config.js
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-eval' 'unsafe-inline';
  style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net;
  img-src 'self' blob: data: https:;
  connect-src 'self' https://*.supabase.co https://api.openai.com;
  frame-ancestors 'none';
`
```

### A.6 结构化日志

```typescript
// lib/logger.ts
export function createLogger(context: { requestId?: string } = {}) {
  const log = (level: string, message: string, data?: Record<string, unknown>) => {
    const entry = { timestamp: new Date().toISOString(), level, message, ...context, ...data }
    console[level](process.env.NODE_ENV === 'production' ? JSON.stringify(entry) : entry)
  }
  return {
    info: (msg: string, data?: Record<string, unknown>) => log('info', msg, data),
    error: (msg: string, data?: Record<string, unknown>) => log('error', msg, data),
  }
}
```

### B.1 tsconfig.json

```json
{
  "compilerOptions": {
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "lib": ["dom", "dom.iterable", "esnext"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "paths": { "@/*": ["./src/*"] }
  }
}
```

### B.2 .eslintrc.json

```json
{
  "extends": ["next/core-web-vitals", "plugin:@typescript-eslint/recommended", "prettier"],
  "rules": {
    "no-console": ["warn", { "allow": ["warn", "error"] }],
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "@typescript-eslint/consistent-type-imports": "error"
  }
}
```

### B.3 .lintstagedrc.json

```json
{
  "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
  "*.{json,md,yml}": ["prettier --write"]
}
```

### C.1 PR模板 (.github/pull_request_template.md)

```markdown
## Summary
<!-- 简述改动 -->

## Changes
- [ ] Feature / Bug fix / Refactoring / Tests

## Checklist
- [ ] Self-review completed
- [ ] No console.log or `any` types
- [ ] i18n: No hardcoded strings
```

### C.2 GitHub Actions CI (.github/workflows/ci.yml)

```yaml
name: CI
on: [push, pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm check:circular
      - run: pnpm test:coverage
```

### D. Worker数据表结构

```sql
CREATE TABLE context_extraction_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES files(id),
  pdf_hash VARCHAR(64) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'zombie')),
  locked_at TIMESTAMPTZ,
  attempts INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_context_jobs_status ON context_extraction_jobs(status);
```

---

**文档版本**：v4.0
**最后更新**：2026-01-16
**适用项目**：StudentAid Web MVP
