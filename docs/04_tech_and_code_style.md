# 04 技术与代码规范

> **文档定位**：技术栈、代码规范与实现约束;业务需求见01,API契约见03。
> **版本状态**：✅ 冻结 - 基于审计修正的最终版本

---

## 1. 技术栈(固定)

| 层次 | 技术选型 | 约束 |
|------|---------|------|
| 前端框架 | Next.js 14+ (App Router) + React 18+ + TypeScript 5.3+ | 统一使用App Router |
| 样式 | Tailwind CSS | 少量自定义CSS |
| 组件库 | Headless UI / Radix UI | 仅用于无锁定样式的交互组件 |
| 状态管理 | React局部状态 + TanStack Query | MVP不引入Redux/MobX |
| BaaS | Supabase (Auth + Postgres + Storage) | **仅server-side使用SDK** |
| LLM | OpenAI API | **仅server-side调用** |
| 包管理 | pnpm | 不混用npm/yarn |

---

## 2. 核心依赖

### 2.1 Supabase集成(Server-Side Only)

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.39.0",
    "@supabase/ssr": "^0.1.0"
  }
}
```

**约束**：使用`@supabase/ssr`包处理App Router的server-side auth,**禁止**在前端组件中直接导入`@supabase/supabase-js`

### 2.2 OpenAI集成

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
| 自动讲解 | `gpt-4-turbo-preview` | 需理解长上下文(单页2-3k tokens) |
| 选中讲解 | `gpt-4` | 平衡质量与成本 |
| 问答 | `gpt-4-turbo-preview` | 需检索整份PDF |
| 文档总结 | `gpt-4-turbo-preview` | 需128K context window |
| 章节总结 | `gpt-3.5-turbo-16k` | 成本优化 |
| 课程提纲 | `gpt-4-turbo-preview` | 需整合多份文档 |

**Streaming配置**：启用接口:explain-page/explain-selection/qa;目标:首token延迟<2s,完整响应<10s

**注意**：Streaming模式下`usage`字段在final chunk中返回,需累积chunks或等待stream结束获取token统计

### 2.3 PDF处理

**前端渲染**：`react-pdf`^7.7.0 + `pdfjs-dist`^3.11.174

**服务端解析**：`pdf-parse`^1.1.1 + `pdf-lib`^1.17.1

**扫描件检测逻辑**：
```typescript
export async function detectScannedPdf(buffer: Buffer): Promise<boolean> {
  const data = await pdf(buffer)
  const firstPages = Math.min(data.numpages, 3)
  const avgCharsPerPage = data.text.length / firstPages
  return avgCharsPerPage < 50  // <50字符/页视为扫描件
}
```

### 2.4 Markdown与LaTeX渲染

```json
{
  "dependencies": {
    "react-markdown": "^9.0.1",
    "remark-math": "^6.0.0",
    "remark-gfm": "^4.0.0",
    "rehype-katex": "^7.0.0",
    "katex": "^0.16.9",
    "prism-react-renderer": "^2.3.1"
  }
}
```

**注意**：KaTeX CSS需全局导入:`import 'katex/dist/katex.min.css'`

### 2.5 虚拟滚动(大型PDF优化)

```json
{
  "dependencies": {
    "react-window": "^1.8.10"
  }
}
```

**用途**：大型PDF(>50页)使用虚拟滚动,仅渲染可见页±2

---

## 3. Supabase集成方式(Server-Side Auth)

### 3.1 认证流程架构

**采用**：Supabase Server-Side Auth
* Supabase签发JWT(access token 1h + refresh token 30d)
* 通过`@supabase/ssr`将token存储在**httpOnly cookie**中
* Next.js middleware和Route Handlers中使用`createServerClient`读取cookie并自动刷新token

**Cookie配置**：
* 名称：`sb-<project-ref>-auth-token`(Supabase自动生成)
* 属性：`HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`
* 前端约束:无需(也不应该)手动操作此cookie

### 3.2 服务端Client创建

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

### 3.3 Middleware中的会话刷新

**关键逻辑**：
* 尝试获取session并自动刷新：`await supabase.auth.getSession()`
* 认证失败时：
  * API请求→返回401(排除公开端点:/api/auth/login等)
  * 页面请求→重定向到`/login?error=session_expired`(排除公开页面:/login等)
* Supabase服务异常→记录错误并返回503(不允许未认证访问)

**配置需要鉴权的路径**：
```typescript
export const config = {
  matcher: [
    '/courses/:path*',
    '/account/:path*',
    '/api/:path*',
  ]
}
```

### 3.4 前端约束

* 调用`/api/*`时使用`credentials: 'include'`
* 浏览器自动携带httpOnly cookie
* **禁止**在前端读取/存储token(不用localStorage/sessionStorage存储token)

---

## 4. 前端目录结构

```
/src
  /app
    /(public)           # 公共路由:/login,/register
    /(app)              # 业务路由:/courses,/courses/[courseId],...
    /api                # Route Handlers:/api/courses/route.ts,...
    /auth/callback      # 邮箱验证回调(非/api路径)
  /components           # 通用UI组件:Button,Input,Dialog,...
  /features             # 业务模块
    /auth               # 登录/注册表单与hooks
    /courses            # 课程列表、卡片、创建/删除
    /files              # PDF列表、上传
    /reader             # PDF阅读器(左侧,40-50%宽度)
    /stickers           # 贴纸栏(中栏,25-30%宽度)
    /qa                 # 问答与总结区(右栏,25-30%宽度)
    /usage              # 配额展示
  /lib                  # 通用工具函数、API封装、BaaS SDK封装
  /types                # 全局类型定义:User,Course,File,Sticker,...
  /config               # 环境变量读取与配额配置
```

---

## 5. TypeScript与代码规范

### 5.1 语言设置

* 全项目使用TypeScript,禁用`.js`业务代码
* `strict`模式开启,避免`any`滥用

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

### 5.2 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 组件/类名 | PascalCase | `CourseCard`,`PdfReader`,`AiPanel` |
| 函数/变量 | camelCase | `fetchCourses`,`handleSubmit` |
| Hooks | use开头 | `useCourseList`,`useAiExplainPage` |
| 常量/枚举 | UPPER_SNAKE_CASE | `COURSE_LIMIT`,`AI_QUOTA_BUCKETS` |
| 组件文件 | kebab-case | `course-card.tsx`,`pdf-reader.tsx` |

### 5.3 文件与函数大小

* 单文件：≤300行,超过时拆分
* 单函数：≤50行,保持单一职责
* React组件：只负责一层UI+简单状态,复杂逻辑下沉到hooks/lib

---

## 6. React/Next.js使用约定

### 6.1 组件粒度

* 页面级组件(page)：只负责路由与业务模块组合
* 复用型视图：抽成`features/*/components`
* 通用组件：仅在有需要时抽到`/components`

### 6.2 Hooks使用

* 业务数据获取用`useQuery`/`useMutation`,统一封装在`features/*/api`或`features/*/hooks`
* 避免在组件中直接写`fetch`,统一走封装的API client

### 6.3 服务端/客户端划分

* 默认使用客户端组件(需浏览器交互)
* 与SEO相关或可SSR的页面再考虑server component
* Route Handlers只返回JSON,不返回React组件

---

## 7. 数据访问与错误处理

### 7.1 API封装

**基础封装**(`/lib/api-client.ts`)：
* 统一处理:`credentials: "include"`、错误码解析、超时
* **不要**在前端处理/拼接`Authorization`头
* **不要**把任何token写入localStorage/sessionStorage

**鉴权失败处理**：
* 401→清理前端user状态+跳转登录页
* 必要时调用`/api/auth/logout`触发服务端清Cookie

**AI类接口封装**(`features/ai/api`)：
```typescript
// 语义化函数,隐藏底层HTTP细节
export async function explainPage({ courseId, fileId, page }: ExplainPageParams) {
  return fetchJson('/api/ai/explain-page', { method: 'POST', body: { courseId, fileId, page } })
}
```

### 7.2 与BaaS的交互

* 在server端Route Handlers中使用**Supabase SDK**(Auth+Postgres+Storage)
* **禁止**前端直接依赖/调用Supabase SDK
* 前端只感知业务API(`/api/*`),不直接依赖BaaS

### 7.3 错误处理约定

| 错误类型 | HTTP | 前端行为 |
|---------|------|---------|
| 鉴权失败 | 401 | 清理状态+跳转登录 |
| 资源不存在 | 404 | 显示"Not found"状态 |
| 配额触顶 | 429 + `QUOTA_EXCEEDED` | 提示"配额已用尽"+更新配额状态 |
| 自动讲解限流 | 429 + `AUTO_EXPLAIN_LIMIT_REACHED` | 仅针对"Explain this page"按钮降级 |

**登出失败策略**：
```typescript
async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
  } catch (err) {
    console.warn('[Logout] Request failed, clearing local state anyway:', err)
  } finally {
    queryClient.clear()
    // 清理所有本地数据(包括非token的UI偏好等)
    localStorage.clear()
    sessionStorage.clear()
    router.push('/login')
  }
}
```

**原因**：网络错误不应阻止用户登出(用户体验优先);Middleware的鉴权检查作为兜底机制

---

## 8. 配额与限流配置管理

### 8.1 配置文件结构

配额数值定义见01_PRD §3.1

```typescript
// src/config/quotas.ts
export const QUOTA_CONFIG = {
  courses: {
    limit: parseInt(process.env.COURSE_LIMIT || '6'),
  },
  ai: {
    learningInteractions: { limit: 150, perAccount: true, resetMonthly: true },
    documentSummary: { limit: 100, perAccount: true, resetMonthly: true },
    sectionSummary: { limit: 65, perAccount: true, resetMonthly: true },
    courseSummary: { limit: 15, perAccount: true, resetMonthly: true },
  },
  autoExplain: {
    limit: parseInt(process.env.AUTO_EXPLAIN_MONTHLY || '300'),
    perAccount: true,
    resetMonthly: true,
    maxStickersPerRequest: 6,
    timezone: 'UTC',
  },
} as const
```

### 8.2 环境变量清单

```bash
# === Supabase ===
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...  # 仅服务端

# === OpenAI ===
OPENAI_API_KEY=sk-...
OPENAI_ORG_ID=org-...  # 可选

# === 配额配置(账户全局) ===
COURSE_LIMIT=6
AI_LEARNING_LIMIT=150
AI_DOC_SUMMARY_LIMIT=100
AI_SECTION_SUMMARY_LIMIT=65
AI_COURSE_SUMMARY_LIMIT=15
AUTO_EXPLAIN_MONTHLY=300

# === 功能开关 ===
ENABLE_AUTO_EXPLAIN=true
ENABLE_STREAMING=true

# === 构建版本 ===
NEXT_PUBLIC_BUILD_VERSION=v1.0.0
```

---

## 9. UI组件与样式约定

### 9.1 Tailwind使用

* 优先使用Tailwind utility classes
* 复杂样式抽成`@layer components`
* 避免内联style(除非动态计算)

### 9.2 关键组件

* `CourseCard`：课程卡片
* `FileList`：文件列表(按类型分组)
* `PdfViewer`：PDF阅读器(左侧,40-50%宽度)
* `StickerPanel`：贴纸栏(中栏,25-30%宽度,包含自动+手动贴纸)
* `QaPanel`：问答与总结区(右栏,25-30%宽度)
* `QuotaDisplay`：配额展示

**P5页面布局**：采用左中右三栏结构,PDF阅读器、贴纸栏、问答区物理分离,提升空间利用和视觉清晰度

---

## 10. 性能优化策略

性能目标见01_PRD §4.1

### 10.1 性能基线

| 指标 | 目标值(P75) | 说明 |
|------|------------|------|
| PDF首屏(LCP) | <3s | 从导航到首页可见 |
| 翻页响应 | <100ms(P90) | 点击翻页到渲染完成 |
| AI首token(TTFB) | <5s (P75) | 从请求到首响应 |
| AI完整响应 | <15s (P90) | 完整内容返回 |

### 10.2 PDF优化

**大型PDF优化(>50页)**：
* 使用`react-window`虚拟滚动
* 仅渲染可见页±2
* 懒加载页面Canvas

**中小型PDF**：
* 预加载相邻页
* 使用React Query的`staleTime`避免重复请求

### 10.3 AI响应优化

**Streaming处理**：
* **理想**：使用streaming,首token<2s,逐字显示
* **降级**：
  * 15s未完成→显示"AI正在处理,请稍候..." + [取消]按钮
  * 30s仍未完成→自动超时+提示"请求超时,请稍后重试"

**配额处理规则**：
* Streaming已返回首token→配额已扣除,不退还
* Streaming连接断开但未返回首token→配额未扣除

---

## 11. MarkdownRenderer组件

AI文本格式规范见03_API §3.0.3

```typescript
// components/MarkdownRenderer.tsx
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import remarkGfm from 'remark-gfm'
import rehypeKatex from 'rehype-katex'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath, remarkGfm]}
      rehypePlugins={[rehypeKatex]}
      components={{
        code({ node, inline, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '')
          return !inline && match ? (
            <SyntaxHighlighter language={match[1]} {...props}>
              {String(children).replace(/\n$/, '')}
            </SyntaxHighlighter>
          ) : (
            <code className={className} {...props}>
              {children}
            </code>
          )
        }
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
```

**使用约定**：
* 所有AI返回的`contentMarkdown`统一使用此组件渲染
* 接收后端返回的**纯文本Markdown字符串**
* 若新增AI能力,优先复用或扩展该组件

---

## 12. 国际化(i18n)准备

* MVP不做多语言切换
* 用户可见文案集中管理(`/config/texts.ts`或简单i18n文件)
* 避免在多个组件中重复硬编码相同文案

---

## 13. 数据收集实施

数据收集规范见01_PRD §2.6

### 13.1 建议收集字段(可选实施)

**轻量行为数据**（在`files`表添加）：
```sql
ALTER TABLE files ADD COLUMN has_used_auto_explain BOOLEAN DEFAULT FALSE;
ALTER TABLE files ADD COLUMN has_used_manual_explain BOOLEAN DEFAULT FALSE;
ALTER TABLE files ADD COLUMN has_generated_summary BOOLEAN DEFAULT FALSE;
```

**PDF内容Hash**（成本优化）：
```sql
ALTER TABLE files ADD COLUMN pdf_content_hash VARCHAR(64);  -- SHA-256
```

**Hash计算**：
```typescript
// lib/pdf-hash.ts
import crypto from 'crypto'
import pdf from 'pdf-parse'

export async function calculatePdfHash(buffer: Buffer): Promise<string> {
  const data = await pdf(buffer)
  return crypto.createHash('sha256').update(data.text).digest('hex')
}
```

**设备与客户端状态**（安全、兼容性、排错）：

**注意**：使用TanStack Query的全局配置添加client version header,避免覆盖window.fetch

```typescript
// lib/client-info.ts
import { UAParser } from 'ua-parser-js'

export function parseClientInfo(req: Request) {
  const userAgent = req.headers.get('user-agent') || ''
  const parser = new UAParser(userAgent)
  
  return {
    browserName: parser.getBrowser().name,
    browserVersion: parser.getBrowser().version,
    deviceType: parser.getDevice().type || 'desktop',
    osName: parser.getOS().name,
    clientVersion: req.headers.get('x-client-version') || 'unknown'
  }
}
```

**用户时区与本地化**：
```typescript
// 前端获取用户时区
const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
const userLocale = navigator.language

// 用于显示配额重置倒计时（本地时间）
function formatResetTime(resetAtUTC: string, userTimezone: string) {
  return new Date(resetAtUTC).toLocaleString('en-US', { 
    timeZone: userTimezone,
    hour: '2-digit',
    minute: '2-digit'
  })
}
```

**安全与审计数据**（账号安全、风控、事故追溯）：

```sql
-- 登录与关键动作审计表
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type VARCHAR(50) NOT NULL,
  ip_prefix VARCHAR(20),  -- 仅存储/24前缀或hash，不存完整IP
  user_agent VARCHAR(255),
  request_id VARCHAR(50),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 会话安全信号
CREATE TABLE user_security (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_login_at TIMESTAMP,
  last_login_ip_prefix VARCHAR(20),
  failed_login_count INT DEFAULT 0,
  last_failed_at TIMESTAMP,
  is_rate_limited BOOLEAN DEFAULT FALSE,
  rate_limit_until TIMESTAMP,
  risk_flags JSONB,
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**IP地址处理**（隐私保护）：
```typescript
// lib/security/ip-utils.ts
import crypto from 'crypto'

export function sanitizeIP(ip: string): string {
  // 方案1: 仅保留/24前缀（推荐）
  const parts = ip.split('.')
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.0`
  }
  
  // 方案2: Hash处理（更强隐私）
  return crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16)
}
```

**运行监控与成本核算数据**（稳定性、成本控制）：

**注意**：请求日志应在Route Handler中记录,middleware运行在Edge Runtime不支持数据库连接

```sql
-- API请求日志表（在Route Handler中记录）
CREATE TABLE request_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id VARCHAR(50) NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  endpoint VARCHAR(100) NOT NULL,
  method VARCHAR(10),
  status_code INT,
  latency_ms INT,
  error_code VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- AI调用成本追踪表
CREATE TABLE ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id VARCHAR(50),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  course_id UUID,
  file_id UUID,
  operation_type VARCHAR(50),
  model VARCHAR(50),
  input_tokens INT,
  output_tokens INT,
  cost_usd_approx DECIMAL(10, 6),
  latency_ms INT,
  success BOOLEAN,
  error_code VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);
```

**AI成本追踪**：
```typescript
// lib/ai/cost-tracker.ts
const PRICING = {
  'gpt-4-turbo-preview': { input: 0.01 / 1000, output: 0.03 / 1000 },
  'gpt-4': { input: 0.03 / 1000, output: 0.06 / 1000 },
  'gpt-3.5-turbo-16k': { input: 0.003 / 1000, output: 0.004 / 1000 }
} as const

export async function trackAIUsage(params: {
  requestId: string
  userId: string
  courseId?: string
  fileId?: string
  operationType: string
  model: string
  inputTokens: number
  outputTokens: number
  latencyMs: number
  success: boolean
  errorCode?: string
}) {
  const pricing = PRICING[params.model] || { input: 0, output: 0 }
  const costUsd = 
    params.inputTokens * pricing.input + 
    params.outputTokens * pricing.output
  
  await db.aiUsageLog.create({
    data: {
      ...params,
      costUsdApprox: costUsd,
      createdAt: new Date()
    }
  })
  
  return costUsd
}
```

**用户反馈收集**（产品改进、问题定位）：

```sql
CREATE TABLE user_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  course_id UUID,
  file_id UUID,
  page INT,
  message TEXT NOT NULL,
  include_diagnostics BOOLEAN DEFAULT FALSE,
  diagnostics JSONB,
  status VARCHAR(20) DEFAULT 'open',
  created_at TIMESTAMP DEFAULT NOW()
);
```

**计费与权限预留字段**（未来扩展）：

```sql
CREATE TABLE user_subscriptions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan VARCHAR(20) DEFAULT 'free',  -- free, trial, pro
  quota_overrides JSONB,
  billing_customer_id VARCHAR(100),
  billing_subscription_id VARCHAR(100),
  entitlements JSONB DEFAULT '{"autoExplain": true, "courseSummary": true}',
  trial_ends_at TIMESTAMP,
  subscription_status VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**配额覆盖逻辑**：
```typescript
// lib/quota/get-user-quota.ts
export async function getUserQuotaLimit(userId: string, bucket: string): Promise<number> {
  const subscription = await db.userSubscription.findUnique({
    where: { userId }
  })
  
  // 检查配额覆盖（管理员手动调整）
  if (subscription?.quotaOverrides?.[bucket]) {
    return subscription.quotaOverrides[bucket]
  }
  
  // 根据计划返回默认配额（见01_PRD §3.1）
  const planQuotas = {
    free: {
      learningInteractions: 150,
      documentSummary: 100,
      sectionSummary: 65,
      courseSummary: 15,
      autoExplain: 300
    },
    trial: {
      learningInteractions: 300,
      documentSummary: 200,
      sectionSummary: 130,
      courseSummary: 30,
      autoExplain: 600
    },
    pro: {
      learningInteractions: 1000,
      documentSummary: 500,
      sectionSummary: 300,
      courseSummary: 100,
      autoExplain: 2000
    }
  }
  
  const plan = subscription?.plan || 'free'
  return planQuotas[plan][bucket] || QUOTA_CONFIG.ai[bucket].limit
}
```

**定时任务调度**（配额重置、数据清理）：

配额按注册日期周期重置需要每天运行Cron Job：

```typescript
// scripts/reset-monthly-quota.ts
export async function resetMonthlyQuota() {
  const now = new Date()
  const todayDay = now.getUTCDate()  // 今天是几号
  
  // 查找所有注册日期为今天的用户
  const users = await db.user.findMany({
    where: {
      // 提取created_at的日期部分与todayDay匹配
      // 使用SQL: EXTRACT(DAY FROM created_at) = todayDay
    },
    select: { id: true, createdAt: true }
  })
  
  for (const user of users) {
    const registrationDay = new Date(user.createdAt).getUTCDate()
    
    if (registrationDay === todayDay) {
      // 重置该用户的所有配额
      await db.quota.updateMany({
        where: { userId: user.id },
        data: {
          used: 0,
          resetAt: calculateNextResetDate(user.createdAt)
        }
      })
    }
  }
  
  console.log(`[Cron] Reset quotas for ${users.length} users (registration day: ${todayDay})`)
}

// 计算下次重置日期
function calculateNextResetDate(registrationDate: Date): Date {
  const registrationDay = new Date(registrationDate).getUTCDate()
  const now = new Date()
  const nextReset = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,  // 下个月
    registrationDay,
    0, 0, 0, 0
  ))
  
  // 处理边界情况：如果注册日昨31号,但下个月只有30天
  if (nextReset.getUTCDate() !== registrationDay) {
    // 设置为下个月的最后一天
    nextReset.setUTCDate(0)
  }
  
  return nextReset
}

// vercel.json
{
  "crons": [{
    "path": "/api/cron/reset-monthly-quota",
    "schedule": "0 0 * * *"  // 每天00:00 UTC运行,检查注册日匹配的用户
  }]
}
```

**重置逻辑说明**：
* Cron Job每天00:00 UTC运行
* 检查今天是几号(例如7号)
* 查找所有在X月7号注册的用户
* 重置这些用户的配额为0
* 计算下次重置日期(下个月7号)

**边界情况处理**：
* 用户29/30/31号注册,但某些月份没有这一天
* 解决：使用该月的最后一天重置(例如2月28/29号)
```

**审计日志定期清理**：
```typescript
// scripts/cleanup-audit-logs.ts
export async function cleanupOldAuditLogs(retentionDays: number = 90) {
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
  
  const result = await db.auditLog.deleteMany({
    where: { createdAt: { lt: cutoffDate } }
  })
  
  console.log(`[Cleanup] Deleted ${result.count} audit logs older than ${retentionDays} days`)
}
```

### 13.2 禁止收集（明确不做）

```typescript
// ❌ 禁止的代码示例
const userIP = req.headers['x-forwarded-for']  // 禁止收集完整IP
import FingerprintJS from '@fingerprintjs/fingerprintjs'  // 禁止设备指纹
import ReactGA from 'react-ga'  // 禁止Google Analytics

// ❌ 禁止记录详细行为
window.addEventListener('click', (e) => {
  clickTimeline.push({ timestamp: Date.now(), target: e.target })  // 禁止
})

// ✅ 允许的日志（聚合级）
console.log('[API] explain-page called', {
  userId: user.id,
  fileId: params.fileId,
  page: params.page,
  duration: Date.now() - startTime,
  quotaRemaining: quota.remaining
})
```

### 13.3 数据删除实现

**账户删除**：
```typescript
// DELETE /api/account
async function deleteAccount(userId: string) {
  await db.course.deleteMany({ where: { userId } })  // 级联删除所有数据
  await db.quota.deleteMany({ where: { userId } })
  await supabaseAdmin.auth.admin.deleteUser(userId)
  
  // 清理Storage中的PDF
  const { data: files } = await supabase.storage.from('pdfs').list(`${userId}/`)
  for (const file of files) {
    await supabase.storage.from('pdfs').remove([`${userId}/${file.name}`])
  }
}
```

---

## 附录：实施优先级

### P0（必须立即实施）
- ✅ Token有效期30天
- ✅ Cookie API正确签名
- ✅ 会话刷新使用getSession()
- ✅ 扫描件检测算法修正
- ✅ Streaming配额扣除规则
- ✅ 虚拟滚动依赖添加

### P1（强烈建议实施）
- 轻量行为数据收集
- PDF内容Hash
- 设备与客户端状态
- 安全与审计数据
- 定时任务调度

### P2（可选实施）
- 运行监控与成本核算
- 用户反馈收集
- 计费与权限预留
