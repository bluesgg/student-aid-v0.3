# 04 技术与代码规范(精简版)

> **文档定位**：技术栈、代码规范与实现约束;业务需求见01,API契约见03。

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

### 2.3 PDF处理

**前端渲染**：`react-pdf`^7.7.0 + `pdfjs-dist`^3.11.174

**服务端解析**：`pdf-parse`^1.1.1 + `pdf-lib`^1.17.1

**扫描件检测逻辑**：
```typescript
export async function detectScannedPdf(buffer: Buffer): Promise<boolean> {
  const data = await pdf(buffer, { max: 3 })  // 只解析前3页
  const avgCharsPerPage = data.text.length / Math.min(data.numpages, 3)
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

---

## 3. Supabase集成方式(Server-Side Auth)

### 3.1 认证流程架构

**采用**：Supabase Server-Side Auth
* Supabase签发JWT(access token 1h + refresh token 7d)
* 通过`@supabase/ssr`将token存储在**httpOnly cookie**中
* Next.js middleware和Route Handlers中使用`createServerClient`读取cookie并自动刷新token

**Cookie配置**：
* 名称：`sb-<project-ref>-auth-token`(Supabase自动生成)
* 属性：`HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`
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
        set(name, value, options) { cookieStore.set({ name, value, ...options }) },
        remove(name, options) { cookieStore.set({ name, value: '', ...options }) },
      },
    }
  )
}
```

### 3.3 Middleware中的会话刷新

**关键逻辑**：
* 尝试获取用户并自动刷新session:`await supabase.auth.getUser()`
* 认证失败时：
  * API请求→返回401(排除公开端点:/api/auth/login等)
  * 页面请求→重定向到`/login?error=session_expired`(排除公开页面:/login等)
* Supabase服务异常→记录错误但允许请求通过(降级策略)

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
* **禁止**在前端读取/存储token(不用localStorage/sessionStorage)

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
    /reader             # PDF阅读器(左侧)
    /ai                 # AI面板、贴纸、问答、总结(右侧)
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

```typescript
// src/config/quotas.ts
export const QUOTA_CONFIG = {
  courses: {
    limit: parseInt(process.env.COURSE_LIMIT || '6'),
  },
  ai: {
    learningInteractions: { limit: 150, perAccount: true },
    documentSummary: { limit: 100, perAccount: true },
    sectionSummary: { limit: 65, perAccount: true },
    courseSummary: { limit: 15, perAccount: true },
  },
  autoExplain: {
    perAccountDailyLimit: parseInt(process.env.AUTO_EXPLAIN_DAILY || '300'),
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
AUTO_EXPLAIN_DAILY=300

# === 功能开关 ===
ENABLE_AUTO_EXPLAIN=true
ENABLE_STREAMING=true
```

---

## 9. UI组件与样式约定

### 9.1 Tailwind使用

* 优先使用Tailwind工具类
* 复用度高的样式抽成组件或封装为`className`帮助函数
* 避免JSX中出现过长class串(>1-2行),拆到子组件

### 9.2 AI面板与贴纸组件

**组件拆分**：
* `AiPanel`：整体容器,上下区域拆分
* `StickerList`：贴纸列表(自动+手动)
* `StickerItem`：单条贴纸(折叠/展开、内部滚动)
* `QaPanel` / `QaHistory` / `QaInput`：问答与总结区

**贴纸组件要求**：
* 支持`auto`/`manual`两种类型的样式差异(不同背景色/标签)
* 支持折叠/展开状态(`folded`字段)
* 内部滚动(`max-height` + `overflow-auto`)

---

## 10. 性能优化与监控

### 10.1 性能基线

| 指标 | 目标值 | 测试条件 |
|------|--------|---------|
| PDF首屏(LCP) | <3s (P75) | Fast 3G + 4x CPU throttling |
| AI首token(TTFB) | <5s (P75) | 从请求到首响应 |

### 10.2 PDF渲染优化

**基础渲染**：
* 默认分页模式(page-by-page),避免一次性渲染全部
* 每页独立渲染到Canvas,避免DOM节点过多
* 使用`react-pdf`懒加载特性

**大型PDF优化(>50页)**：
* 启用虚拟滚动(`react-window` / `react-virtualized`)
* 仅渲染可见页±2页
* 滚动时动态卸载远离视口的页面

**贴纸加载联动**：
* 初始只请求"当前页±2页"的贴纸
* 滚动时触发增量加载
* 使用React Query的`staleTime`避免重复请求

**缓存策略**：
* 已渲染Canvas缓存在内存(LRU淘汰)
* PDF文件通过Service Worker缓存
* 贴纸数据通过React Query缓存(5分钟staleTime)

### 10.3 AI响应超时处理

* **理想**：使用streaming,首token<2s,逐字显示
* **超时处理**：
  * 15s未完成→显示"AI正在处理..."+「取消」按钮
  * 30s仍未完成→自动超时+提示"请求超时,请稍后重试"

**取消操作实现**：
```typescript
const abortControllerRef = useRef<AbortController | null>(null)

async function explainPage(params) {
  abortControllerRef.current = new AbortController()
  
  try {
    const response = await fetch('/api/ai/explain-page', {
      method: 'POST',
      signal: abortControllerRef.current.signal,
      // ...
    })
  } catch (err) {
    if (err.name === 'AbortError') {
      console.log('[AI] Request cancelled by user')
    } else {
      throw err
    }
  }
}

function cancelRequest() {
  abortControllerRef.current?.abort()
}
```

**配额处理规则**：Streaming已开始(`hasReceivedFirstToken === true`)→配额已扣除,不退还;Streaming未开始→配额未扣除

---

## 11. AI回复格式渲染(统一)

### 11.1 Markdown渲染组件

**位置**：`/src/components/markdown-renderer.tsx`

**基于**：
* `react-markdown`：Markdown解析
* `remark-math` + `remark-gfm`：数学公式+GitHub风格
* `rehype-katex`：LaTeX渲染
* `prism-react-renderer`：代码高亮

**全局导入**：`import 'katex/dist/katex.min.css'` (in app/layout.tsx)

### 11.2 LaTeX数学公式

* 行内：`$...$`或`\(...\)`
* 块级：`$$...$$`或`\[...\]`
* 使用KaTeX渲染,要求AI回复中公式语法符合KaTeX能力范围

### 11.3 使用约定

**所有AI相关展示统一使用`MarkdownRenderer`**：
* 自动讲解贴纸(Explain this page)
* 选中文本讲解贴纸(From selection/追问链)
* 基于当前PDF的问答回答
* 文档总结/章节总结/课程级提纲

**约束**：
* 不直接渲染`innerHTML`
* 接收后端返回的**纯文本Markdown字符串**
* 若新增AI能力,优先复用或扩展该组件

---

## 12. 国际化(i18n)准备

* MVP不做多语言切换
* 用户可见文案集中管理(`/config/texts.ts`或简单i18n文件)
* 避免在多个组件中重复硬编码相同文案

---

## 13. 数据收集实施

### 13.1 建议收集字段（可选实施）

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

```typescript
// lib/client-info.ts
import { UAParser } from 'ua-parser-js'

export function parseClientInfo(req: Request) {
  const userAgent = req.headers.get('user-agent') || ''
  const parser = new UAParser(userAgent)
  
  return {
    browserName: parser.getBrowser().name,      // "Chrome", "Firefox", "Safari"
    browserVersion: parser.getBrowser().version, // "120.0.0"
    deviceType: parser.getDevice().type || 'desktop', // "desktop", "tablet"
    osName: parser.getOS().name,                // "Windows", "macOS"
    clientVersion: req.headers.get('x-client-version') || 'unknown'
  }
}

// 前端发送client version
// app/layout.tsx
export default function RootLayout({ children }) {
  useEffect(() => {
    // 在所有API请求中添加client version header
    const originalFetch = window.fetch
    window.fetch = (url, options = {}) => {
      return originalFetch(url, {
        ...options,
        headers: {
          ...options.headers,
          'X-Client-Version': process.env.NEXT_PUBLIC_BUILD_VERSION || 'dev'
        }
      })
    }
  }, [])
  
  return <html>{children}</html>
}
```

**用户时区与本地化**：
```typescript
// 前端获取用户时区
const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone  // "America/New_York"
const userLocale = navigator.language  // "en-US"

// 用于显示配额重置倒计时（本地时间）
function formatResetTime(resetAtUTC: string, userTimezone: string) {
  return new Date(resetAtUTC).toLocaleString('en-US', { 
    timeZone: userTimezone,
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 示例：显示"Resets at 7:00 PM (your local time)"而非"00:00 UTC"
```

**存储位置**（可选）：
```sql
-- 在sessions或audit_logs表中记录（不在users表）
CREATE TABLE client_sessions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  browser_name VARCHAR(50),
  browser_version VARCHAR(20),
  device_type VARCHAR(20),
  os_name VARCHAR(50),
  client_version VARCHAR(20),
  locale VARCHAR(10),
  timezone VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  last_active_at TIMESTAMP DEFAULT NOW()
);

-- 或仅在错误日志中记录
CREATE TABLE error_logs (
  id UUID PRIMARY KEY,
  user_id UUID,
  error_type VARCHAR(100),
  error_message TEXT,
  client_info JSONB,  -- { browserName, browserVersion, deviceType, clientVersion }
  created_at TIMESTAMP DEFAULT NOW()
);
```

**用途说明**：
- `browserName/Version`: 兼容性测试、排查浏览器特定bug
- `deviceType`: 优化移动端体验（虽然MVP不做专门适配）
- `locale/timezone`: 用户本地化显示（如倒计时、日期格式）
- `clientVersion`: 快速定位问题版本、支持回滚决策

**不用于**：广告追踪、设备指纹、用户画像

**安全与审计数据**（账号安全、风控、事故追溯）：

```sql
-- 登录与关键动作审计表
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,  -- 允许NULL（注册失败等）
  event_type VARCHAR(50) NOT NULL,  -- login_success, login_failed, logout, password_reset, etc.
  ip_prefix VARCHAR(20),  -- 仅存储/24前缀或hash，不存完整IP
  user_agent VARCHAR(255),
  request_id VARCHAR(50),  -- 链路追踪ID
  metadata JSONB,  -- 额外上下文，如失败原因、重置邮箱等
  created_at TIMESTAMP DEFAULT NOW()
);

-- 索引优化查询
CREATE INDEX idx_audit_logs_user_event ON audit_logs(user_id, event_type, created_at DESC);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);  -- 用于定期清理

-- 会话安全信号（在users表或单独表）
CREATE TABLE user_security (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_login_at TIMESTAMP,
  last_login_ip_prefix VARCHAR(20),
  failed_login_count INT DEFAULT 0,
  last_failed_at TIMESTAMP,
  is_rate_limited BOOLEAN DEFAULT FALSE,
  rate_limit_until TIMESTAMP,
  risk_flags JSONB,  -- { "multiple_failed_logins": true, "unusual_location": false }
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
    return `${parts[0]}.${parts[1]}.${parts[2]}.0`  // 192.168.1.0
  }
  
  // 方案2: Hash处理（更强隐私）
  return crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16)
}

// 使用示例
const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0] || req.ip
const ipPrefix = sanitizeIP(clientIP)
```

**登录审计实现**：
```typescript
// lib/security/audit-log.ts
export async function logAuditEvent(event: {
  userId?: string
  eventType: 'login_success' | 'login_failed' | 'logout' | 'password_reset' | 
             'resend_confirmation' | 'email_verified' | 'account_deleted'
  ipAddress?: string
  userAgent?: string
  requestId?: string
  metadata?: Record<string, any>
}) {
  await db.auditLog.create({
    data: {
      userId: event.userId,
      eventType: event.eventType,
      ipPrefix: event.ipAddress ? sanitizeIP(event.ipAddress) : null,
      userAgent: event.userAgent?.substring(0, 255),  // 截断防止过长
      requestId: event.requestId,
      metadata: event.metadata,
      createdAt: new Date()
    }
  })
}

// 使用示例
// POST /api/auth/login
export async function POST(req: Request) {
  const { email, password } = await req.json()
  const requestId = req.headers.get('x-request-id') || crypto.randomUUID()
  
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    
    if (error) {
      // 记录失败
      await logAuditEvent({
        eventType: 'login_failed',
        ipAddress: req.headers.get('x-forwarded-for'),
        userAgent: req.headers.get('user-agent'),
        requestId,
        metadata: { email, reason: error.message }
      })
      
      // 更新失败计数
      await incrementFailedLoginCount(email)
      
      return NextResponse.json({ ok: false, error: 'INVALID_CREDENTIALS' }, { status: 401 })
    }
    
    // 记录成功
    await logAuditEvent({
      userId: data.user.id,
      eventType: 'login_success',
      ipAddress: req.headers.get('x-forwarded-for'),
      userAgent: req.headers.get('user-agent'),
      requestId
    })
    
    // 重置失败计数
    await resetFailedLoginCount(data.user.id)
    
    return NextResponse.json({ ok: true, data: { user: data.user } })
  } catch (err) {
    // 记录异常
    await logAuditEvent({
      eventType: 'login_failed',
      ipAddress: req.headers.get('x-forwarded-for'),
      requestId,
      metadata: { email, error: String(err) }
    })
    throw err
  }
}
```

**会话安全信号更新**：
```typescript
// lib/security/session-security.ts
export async function incrementFailedLoginCount(email: string) {
  const user = await db.user.findUnique({ where: { email } })
  if (!user) return
  
  const security = await db.userSecurity.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      failedLoginCount: 1,
      lastFailedAt: new Date()
    },
    update: {
      failedLoginCount: { increment: 1 },
      lastFailedAt: new Date()
    }
  })
  
  // 触发限流（5次失败）
  if (security.failedLoginCount >= 5) {
    await db.userSecurity.update({
      where: { userId: user.id },
      data: {
        isRateLimited: true,
        rateLimitUntil: new Date(Date.now() + 15 * 60 * 1000),  // 15分钟
        riskFlags: { multiple_failed_logins: true }
      }
    })
  }
}

export async function resetFailedLoginCount(userId: string) {
  await db.userSecurity.upsert({
    where: { userId },
    create: {
      userId,
      lastLoginAt: new Date(),
      failedLoginCount: 0
    },
    update: {
      lastLoginAt: new Date(),
      failedLoginCount: 0,
      isRateLimited: false,
      rateLimitUntil: null,
      riskFlags: {}
    }
  })
}
```

**审计日志定期清理**（Cron Job）：
```typescript
// scripts/cleanup-audit-logs.ts
export async function cleanupOldAuditLogs(retentionDays: number = 90) {
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
  
  const result = await db.auditLog.deleteMany({
    where: {
      createdAt: { lt: cutoffDate }
    }
  })
  
  console.log(`[Cleanup] Deleted ${result.count} audit logs older than ${retentionDays} days`)
}

// 每日运行（Vercel Cron或GitHub Actions）
// vercel.json
{
  "crons": [{
    "path": "/api/cron/cleanup-audit-logs",
    "schedule": "0 2 * * *"  // 每天凌晨2点UTC
  }]
}
```

**用途说明**：
- `audit_logs`: 事故追溯、安全分析、检测异常行为
- `user_security`: 实时风控、防暴力破解、账号保护
- `ip_prefix`: 检测异常登录位置（不侵犯隐私）
- `request_id`: 链路追踪、关联前后端日志

**留存期**: 30-90天，定期自动清理，不长期保存


**运行监控与成本核算数据**（稳定性、成本控制、限流优化）：

```sql
-- API请求日志表
CREATE TABLE request_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id VARCHAR(50) NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  endpoint VARCHAR(100) NOT NULL,  -- /api/ai/explain-page
  method VARCHAR(10),  -- POST, GET
  status_code INT,
  latency_ms INT,
  error_code VARCHAR(50),  -- QUOTA_EXCEEDED, SERVICE_UNAVAILABLE
  created_at TIMESTAMP DEFAULT NOW()
);

-- AI调用成本追踪表
CREATE TABLE ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id VARCHAR(50),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  course_id UUID,
  file_id UUID,
  operation_type VARCHAR(50),  -- explain-page, explain-selection, qa, summarize-*
  model VARCHAR(50),  -- gpt-4-turbo-preview, gpt-4, gpt-3.5-turbo-16k
  input_tokens INT,
  output_tokens INT,
  cost_usd_approx DECIMAL(10, 6),  -- 0.001234
  latency_ms INT,
  success BOOLEAN,
  error_code VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 客户端性能指标表（聚合数据）
CREATE TABLE client_performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  metric_type VARCHAR(50),  -- pdf_lcp, pdf_ttfb, ai_ttfb
  value_ms INT,
  page_url VARCHAR(255),
  client_version VARCHAR(20),
  browser_name VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 索引优化
CREATE INDEX idx_request_logs_endpoint ON request_logs(endpoint, created_at DESC);
CREATE INDEX idx_ai_usage_logs_user ON ai_usage_logs(user_id, created_at DESC);
CREATE INDEX idx_ai_usage_logs_model ON ai_usage_logs(model, created_at DESC);
```

**请求日志中间件**：
```typescript
// middleware/request-logger.ts
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

export async function logRequest(req: NextRequest, res: NextResponse) {
  const requestId = req.headers.get('x-request-id') || crypto.randomUUID()
  const startTime = Date.now()
  
  // 等待响应完成
  const latencyMs = Date.now() - startTime
  
  // 记录请求日志
  await db.requestLog.create({
    data: {
      requestId,
      userId: req.user?.id,  // 从middleware获取
      endpoint: req.nextUrl.pathname,
      method: req.method,
      statusCode: res.status,
      latencyMs,
      errorCode: res.headers.get('x-error-code') || null,
      createdAt: new Date()
    }
  })
  
  return res
}
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

// 使用示例
// POST /api/ai/explain-page
export async function POST(req: Request) {
  const requestId = req.headers.get('x-request-id')
  const startTime = Date.now()
  
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [/* ... */]
    })
    
    // 追踪成本
    await trackAIUsage({
      requestId,
      userId: user.id,
      courseId: params.courseId,
      fileId: params.fileId,
      operationType: 'explain-page',
      model: 'gpt-4-turbo-preview',
      inputTokens: response.usage.prompt_tokens,
      outputTokens: response.usage.completion_tokens,
      latencyMs: Date.now() - startTime,
      success: true
    })
    
    return NextResponse.json({ ok: true, data: response })
  } catch (err) {
    // 追踪失败
    await trackAIUsage({
      requestId,
      userId: user.id,
      operationType: 'explain-page',
      model: 'gpt-4-turbo-preview',
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - startTime,
      success: false,
      errorCode: err.code
    })
    throw err
  }
}
```

**客户端性能上报**：
```typescript
// lib/performance/reporter.ts
import { onLCP, onTTFB, onINP } from 'web-vitals'

export function initPerformanceReporting() {
  // PDF首屏LCP
  onLCP((metric) => {
    reportMetric({
      metricType: 'pdf_lcp',
      valueMs: Math.round(metric.value),
      pageUrl: window.location.pathname
    })
  })
  
  // TTFB
  onTTFB((metric) => {
    reportMetric({
      metricType: 'pdf_ttfb',
      valueMs: Math.round(metric.value),
      pageUrl: window.location.pathname
    })
  })
}

async function reportMetric(metric: {
  metricType: string
  valueMs: number
  pageUrl: string
}) {
  // 采样上报（10%用户）
  if (Math.random() > 0.1) return
  
  try {
    await fetch('/api/metrics/performance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...metric,
        clientVersion: process.env.NEXT_PUBLIC_BUILD_VERSION,
        browserName: navigator.userAgent.match(/Chrome|Firefox|Safari/)?.[0]
      })
    })
  } catch (err) {
    // 静默失败，不影响用户体验
    console.debug('[Performance] Failed to report metric:', err)
  }
}

// app/layout.tsx
export default function RootLayout({ children }) {
  useEffect(() => {
    initPerformanceReporting()
  }, [])
  
  return <html>{children}</html>
}
```

**成本分析查询**：
```sql
-- 按用户统计AI成本
SELECT 
  user_id,
  COUNT(*) as total_calls,
  SUM(input_tokens) as total_input_tokens,
  SUM(output_tokens) as total_output_tokens,
  SUM(cost_usd_approx) as total_cost_usd,
  AVG(latency_ms) as avg_latency_ms
FROM ai_usage_logs
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY user_id
ORDER BY total_cost_usd DESC
LIMIT 100;

-- 按模型统计成本
SELECT 
  model,
  operation_type,
  COUNT(*) as call_count,
  AVG(latency_ms) as avg_latency,
  SUM(cost_usd_approx) as total_cost,
  COUNT(*) FILTER (WHERE success = false) as error_count
FROM ai_usage_logs
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY model, operation_type
ORDER BY total_cost DESC;

-- 性能基线监控
SELECT 
  metric_type,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY value_ms) as p50,
  PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY value_ms) as p75,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY value_ms) as p95
FROM client_performance_metrics
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY metric_type;
```

**定期清理与归档**：
```typescript
// scripts/cleanup-monitoring-data.ts
export async function cleanupMonitoringData() {
  const retentionDays = 90
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
  
  // 清理请求日志
  const requestLogs = await db.requestLog.deleteMany({
    where: { createdAt: { lt: cutoffDate } }
  })
  
  // AI成本数据归档到聚合表后再删除
  await aggregateAIUsageToMonthly(cutoffDate)
  const aiLogs = await db.aiUsageLog.deleteMany({
    where: { createdAt: { lt: cutoffDate } }
  })
  
  // 性能指标聚合后删除
  await aggregatePerformanceMetrics(cutoffDate)
  const perfMetrics = await db.clientPerformanceMetric.deleteMany({
    where: { createdAt: { lt: cutoffDate } }
  })
  
  console.log(`[Cleanup] Deleted ${requestLogs.count} request logs, ${aiLogs.count} AI logs, ${perfMetrics.count} perf metrics`)
}

// 月度聚合表（长期保存）
async function aggregateAIUsageToMonthly(beforeDate: Date) {
  await db.$executeRaw`
    INSERT INTO ai_usage_monthly_summary (year, month, model, operation_type, total_calls, total_cost_usd)
    SELECT 
      EXTRACT(YEAR FROM created_at) as year,
      EXTRACT(MONTH FROM created_at) as month,
      model,
      operation_type,
      COUNT(*) as total_calls,
      SUM(cost_usd_approx) as total_cost_usd
    FROM ai_usage_logs
    WHERE created_at < ${beforeDate}
    GROUP BY year, month, model, operation_type
    ON CONFLICT (year, month, model, operation_type) DO UPDATE
    SET total_calls = EXCLUDED.total_calls, total_cost_usd = EXCLUDED.total_cost_usd
  `
}
```

**用途说明**：
- `request_logs`: API健康监控、错误率分析、性能瓶颈定位
- `ai_usage_logs`: 成本核算、模型选择优化、配额调整依据
- `client_performance_metrics`: 验证性能基线（PDF LCP<3s）、浏览器兼容性分析

**隐私保护**：
- ✅ 不记录用户内容（PDF文本、AI回复内容）
- ✅ 仅记录技术指标（tokens、latency、cost）
- ✅ 客户端性能采样上报（10%用户）
- ✅ 定期清理原始数据，保留聚合统计

**留存策略**：
- 原始日志：90天
- 月度聚合：永久保存（仅统计数据）


**用户反馈收集**（产品改进、问题定位）：

```sql
-- 用户反馈表
CREATE TABLE user_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  course_id UUID,
  file_id UUID,
  page INT,  -- 可选，定位到具体页面
  message TEXT NOT NULL,
  include_diagnostics BOOLEAN DEFAULT FALSE,
  diagnostics JSONB,  -- { requestId, errorCode, clientVersion, userAgent }
  status VARCHAR(20) DEFAULT 'open',  -- open, in_progress, resolved, closed
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_feedback_user ON user_feedback(user_id, created_at DESC);
CREATE INDEX idx_feedback_status ON user_feedback(status, created_at DESC);
```

**反馈提交实现**：
```typescript
// POST /api/feedback
export async function POST(req: Request) {
  const { courseId, fileId, page, message, includeDiagnostics } = await req.json()
  const user = await getUser(req)
  
  let diagnostics = null
  if (includeDiagnostics) {
    diagnostics = {
      requestId: req.headers.get('x-request-id'),
      clientVersion: req.headers.get('x-client-version'),
      userAgent: req.headers.get('user-agent'),
      pageUrl: req.headers.get('referer'),
      // 可选：最近的错误日志
      recentErrors: await getRecentErrorsForUser(user.id, 5)
    }
  }
  
  const feedback = await db.userFeedback.create({
    data: {
      userId: user.id,
      courseId,
      fileId,
      page,
      message,
      includeDiagnostics,
      diagnostics,
      status: 'open',
      createdAt: new Date()
    }
  })
  
  return NextResponse.json({ ok: true, data: { feedbackId: feedback.id } })
}
```

**前端反馈组件**：
```typescript
// components/FeedbackButton.tsx
export function FeedbackButton() {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true)
  
  async function handleSubmit() {
    await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courseId: currentCourse?.id,
        fileId: currentFile?.id,
        page: currentPage,
        message,
        includeDiagnostics
      })
    })
    
    toast.success('Thank you for your feedback!')
    setOpen(false)
  }
  
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button variant="ghost" size="sm">
          <MessageSquare className="w-4 h-4 mr-2" />
          Feedback
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send Feedback</DialogTitle>
        </DialogHeader>
        <Textarea 
          placeholder="Tell us what you think or report an issue..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <div className="flex items-center space-x-2">
          <Checkbox 
            id="diagnostics" 
            checked={includeDiagnostics}
            onCheckedChange={setIncludeDiagnostics}
          />
          <label htmlFor="diagnostics" className="text-sm text-gray-600">
            Include diagnostic info (helps us fix bugs faster)
          </label>
        </div>
        <Button onClick={handleSubmit}>Send Feedback</Button>
      </DialogContent>
    </Dialog>
  )
}
```


**计费与权限预留字段**（未来扩展）：

```sql
-- 在users表或单独的user_subscriptions表中添加
CREATE TABLE user_subscriptions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan VARCHAR(20) DEFAULT 'free',  -- free, trial, pro
  quota_overrides JSONB,  -- { "learningInteractions": 200, "autoExplain": 500 }
  billing_customer_id VARCHAR(100),  -- Stripe customer ID
  billing_subscription_id VARCHAR(100),  -- Stripe subscription ID
  entitlements JSONB DEFAULT '{"autoExplain": true, "courseSummary": true}',
  trial_ends_at TIMESTAMP,
  subscription_status VARCHAR(20),  -- active, canceled, past_due
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**配额覆盖逻辑**：
```typescript
// lib/quota/get-user-quota.ts
export async function getUserQuotaLimit(userId: string, bucket: string): Promise<number> {
  // 1. 获取用户订阅信息
  const subscription = await db.userSubscription.findUnique({
    where: { userId }
  })
  
  // 2. 检查配额覆盖（管理员手动调整）
  if (subscription?.quotaOverrides?.[bucket]) {
    return subscription.quotaOverrides[bucket]
  }
  
  // 3. 根据计划返回默认配额
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

**功能开关检查**：
```typescript
// lib/entitlements/check-feature.ts
export async function checkFeatureEnabled(
  userId: string, 
  feature: 'autoExplain' | 'courseSummary' | 'advancedAnalytics'
): Promise<boolean> {
  const subscription = await db.userSubscription.findUnique({
    where: { userId }
  })
  
  // MVP阶段所有功能默认启用
  if (!subscription) return true
  
  return subscription.entitlements?.[feature] ?? true
}

// 使用示例
// POST /api/ai/explain-page
export async function POST(req: Request) {
  const user = await getUser(req)
  
  // 检查功能是否启用
  const autoExplainEnabled = await checkFeatureEnabled(user.id, 'autoExplain')
  if (!autoExplainEnabled) {
    return NextResponse.json(
      { ok: false, error: 'FEATURE_NOT_AVAILABLE' },
      { status: 403 }
    )
  }
  
  // 继续处理...
}
```

**MVP阶段默认值**：
```typescript
// 新用户注册时自动创建
async function createUserSubscription(userId: string) {
  await db.userSubscription.create({
    data: {
      userId,
      plan: 'free',
      quotaOverrides: null,
      billingCustomerId: null,
      entitlements: {
        autoExplain: true,
        courseSummary: true,
        advancedAnalytics: false  // 未来功能
      }
    }
  })
}
```

**说明**：
- MVP阶段所有用户默认`free`计划
- `quotaOverrides`用于管理员手动调整特定用户配额（如测试用户、VIP用户）
- `entitlements`为未来功能开关预留，MVP阶段全部启用
- `billingCustomerId`预留给未来Stripe集成




### 13.2 禁止收集（明确不做）

```typescript
// ❌ 禁止的代码示例
const userIP = req.headers['x-forwarded-for']  // 禁止收集IP
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
