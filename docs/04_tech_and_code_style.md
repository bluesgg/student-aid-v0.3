# 04 技术与代码规范（StudentAid Web） 

> 目标：在 MVP 阶段保持实现简单可控的前提下，统一技术栈与基础代码规范，降低后续维护和扩展成本；同时为「PDF + AI 讲解 / 贴纸 / 问答 / 总结」相关功能提供稳定的技术基座。

---

## 1. 技术栈约定

* **前端框架**：Next.js（App Router） + React + TypeScript
* **样式方案**：Tailwind CSS + 必要时少量自定义 CSS
* **组件库（可选）**：Headless UI / Radix UI（仅用于无锁定样式的交互组件）
* **图标**：Heroicons 或 Lucide（统一来源，避免混用）
* **状态管理**：

  * 以 React 组件局部状态 + React Query（TanStack Query）为主；
  * MVP 阶段避免引入 Redux / MobX 等复杂全局状态管理。
* **数据获取**：
  * Next.js Route Handlers（`app/api/*/route.ts`）作为 BFF 层；
  * **BaaS：Supabase（Auth + Postgres + Storage）**，**仅在 server-side 使用 Supabase SDK**；前端只调用自家 API（不直连 Supabase）。
  * **LLM Provider：OpenAI API**（用于 explain-page / explain-selection / QA / summarize-*），仅在 server-side 调用；密钥仅存在服务端环境变量。

* **包管理工具**：统一使用 `pnpm`，不混用 npm / yarn。
* **构建与打包**：使用 Next.js 内置构建，不额外自定义 Webpack，除非有明确必要。
* **代码托管**：GitHub 单仓库（暂不引入 monorepo）。
* **部署目标**：Vercel 或其他支持 Next.js 的托管平台。

---

## 2. 前端目录结构约定

> 以 Next.js App Router 默认结构为基础，按「路由 / 业务模块 / 通用组件 / 工具」分层。

* `/src`

  * `/app`

    * 公共路由（如 `/login`、`/register`）放在 `(public)` 组；
    * 业务路由（如 `/courses`、`/courses/[courseId]`）放在 `(app)` 组；
    * 每个 API 路由使用 Route Handlers：如 `/app/api/courses/route.ts`。
  * `/components`

    * 无业务耦合的通用 UI 组件：`Button`, `Input`, `Dialog`, `PageHeader` 等；
    * 相对独立、可在多个 feature 间复用。
  * `/features`

    * 按业务模块拆分：

      * `/features/auth`（登录 / 注册表单与 hooks）
      * `/features/courses`（课程列表、课程卡片、创建 / 删除逻辑）
      * `/features/files`（PDF 列表、上传控件）
      * `/features/reader`（PDF 阅读器壳组件，负责左侧 PDF 区域）
      * `/features/ai`（右侧 AI 面板、贴纸栏、问答区域、总结区域的逻辑与 UI）
      * `/features/usage`（配额展示与 Usage 页）
    * 每个模块内再按 `components` / `hooks` / `api` / `types` 做简单分层。
  * `/lib`

    * 通用工具函数（日期格式化、错误处理、API 封装等）；
    * BaaS / 后端 SDK 的轻量封装（如 Supabase client 初始化）。
  * `/types`

    * 全局可复用的 TypeScript 类型定义：

      * 领域模型：`User`, `Course`, `File`, `Sticker`, `Quota`, `Outline` 等；
      * API 响应类型（如 `ApiResponse<T>` 等）。
  * `/config`

    * 环境变量读取与运行时配置（后端基 URL、配额默认值、AI 开关等）。
  * `/tests`

    * 前端单元测试 / 组件测试；
    * 测试文件推荐与被测模块路径对应，例如：`features/courses/__tests__/course-list.test.tsx`。

---

## 3. TypeScript 与代码规范

* **语言设置**：

  * 全项目使用 TypeScript，禁用 `.js` 业务代码（可保留极少数配置文件除外）；
  * `strict` 模式开启，避免 `any` 滥用。
* **tsconfig 基础设置（示例）**：

  * `"strict": true`
  * `"noImplicitAny": true`
  * `"noUnusedLocals": true` / `"noUnusedParameters": true`
  * `"baseUrl": "src"` 并配置合理的 `paths`（适度使用，避免过度 alias）。
* **ESLint + Prettier**：

  * 使用 `eslint-config-next` + `@typescript-eslint` 规则集；
  * 使用 Prettier 格式化，禁止与 ESLint 规则冲突（开启 `eslint-config-prettier`）；
  * CI（或 pre-commit）中执行 `pnpm lint` 和 `pnpm test`。
* **类型使用约定**：

  * 首选 `type` 定义对象与联合类型，不强制禁止 `interface`，但保持一份类型只在一个地方定义；
  * 避免隐式 `any`，如有特殊必要使用 `any` 时：

    * 需显式关闭对应 ESLint 规则，如 `// eslint-disable-next-line @typescript-eslint/no-explicit-any`；
    * 并在同一行写明原因注释。
* **命名规范**：

  * 组件、类名：**大驼峰**（PascalCase），如 `CourseCard`, `PdfReader`, `AiPanel`；
  * 函数、变量：**小驼峰**（camelCase），如 `fetchCourses`, `handleSubmit`；
  * hooks：以 `use` 开头，如 `useCourseList`, `useAiExplainPage`；
  * 常量 / 枚举：`UPPER_SNAKE_CASE`，如 `COURSE_LIMIT`, `AI_QUOTA_BUCKETS`。
* **文件命名**：

  * 组件文件：小写中划线（kebab-case），如 `course-card.tsx`, `pdf-reader.tsx`；
  * hook 文件：`use-xxx.ts`，如 `use-course-list.ts`；
  * 类型文件：`*.types.ts` 或集中存放于 `/types`。
* **文件与函数大小**：

  * 单个文件建议不超过约 **300 行**，超过时考虑拆分组件 / 工具函数；
  * 单个函数建议不超过约 **50 行**，保持单一职责；
  * React 组件尽量只负责一层 UI + 简单状态，将复杂逻辑下沉到 hooks / lib 函数。

---

## 4. React / Next.js 使用约定

* **组件粒度**：

  * 页面级组件（page）只负责路由与业务模块组合；
  * 复用型视图抽成 `features/*/components`；
  * 仅在有需要时再拆到 `/components` 通用组件。
* **Hooks 使用**：

  * 业务数据获取用 `useQuery` / `useMutation`，统一封装在 `features/*/api` 或 `features/*/hooks` 下；
  * 避免在组件中直接写 `fetch`，统一走封装的 API client。
* **服务端 / 客户端划分**：

  * 默认使用客户端组件渲染（需要浏览器交互的部分）；
  * 与 SEO 明显相关或可 SSR 的页面再考虑 server component；
  * Route Handlers 中禁止直接返回 React 组件，只返回 JSON。
* **路由与导航**：

  * 使用 Next.js App Router（`/app` 目录），避免使用旧的 pages Router；
  * 导航使用 `next/link` + `useRouter`（仅在必要时使用编程式导航）。

---

## 5. 数据访问、错误处理与配额

* **API 封装**：

  * 在 `/lib/api-client.ts` 中封装基础 `fetchJson` 等函数；
  * 统一处理鉴权头（`Authorization: Bearer <token>`）、基础错误码解析、超时等；
  * 对 AI 类接口（如 `explain-page`、`explain-selection`、`qa`、`summarize-*`）建议单独封装在 `features/ai/api`，并暴露语义化函数，如：

    * `explainPage({ courseId, fileId, page })`
    * `explainSelection({...})`
    * `askQuestion({...})`
    * `summarizeDocument({...})` 等。
* **与 BaaS 的交互**：
  * 在 server 端 Route Handlers 中使用 **Supabase SDK（Auth + Postgres + Storage）**；
  * **禁止**前端直接依赖/调用 Supabase SDK（本项目约束为 server-side SDK only）；
  * 前端只感知「课程 / 文件 / AI 接口」等业务 API，不直接依赖 BaaS。

* **错误处理约定**：

  * 鉴权失败（401）：清理本地登录状态，并跳转登录页；
  * 资源不存在（404）：在页面中展示友好「Not found」状态；
  * 配额相关错误（`QUOTA_EXCEEDED` 等）：映射到 UI 上的「配额已用尽」提示，并同步更新前端配额状态；
  * 自动讲解限流错误（如 `AUTO_EXPLAIN_LIMIT_REACHED`）：仅针对「Explain this page」按钮做降级提示；
  * 其他错误：统一 toast 或错误提示区域展示。
* **配额检查**：

  * AI 类 API 在服务端统一做配额检查，返回统一错误结构：

    * `code: "QUOTA_EXCEEDED"`；
    * `message`: 用户可读文案；
    * `bucket`: 具体配额桶标识（`learningInteractions` / `documentSummary` / `sectionSummary` / `courseSummary`）。
  * 「Explain this page」不占用用户可见配额桶，前端仅根据接口返回的 `rateLimit` 信息提示自动讲解频率，不与 `Usage` 页中 `aiQuotas` 绑定。

* **LLM 调用约定**：
  * AI 类接口（`explain-page`、`explain-selection`、`qa`、`summarize-*`）统一由 server-side Route Handlers 调用 **OpenAI API**；
  * OpenAI API Key 仅存在服务端环境变量（如 `OPENAI_API_KEY`），不得下发到浏览器；
  * 前端永远只调用 `/api/ai/*`。

---

## 6. UI / 组件与样式约定

* **Tailwind 使用**：

  * 优先使用 Tailwind 工具类实现布局和样式；
  * 对复用度较高的一组样式，可抽成组件或封装为 `className` 帮助函数；
  * 避免在 JSX 中出现过长的 class 串（> 1–2 行），可拆到子组件。
* **组件设计**：

  * 通用组件保持「无业务逻辑」、只暴露 props；
  * 业务组件（如 `CourseCard`、`PdfReaderShell`、`AiPanel`、`StickerList`）允许包含少量业务逻辑，但过重时应分拆 hooks。
* **AI 面板与贴纸组件建议**：

  * 右侧 AI 区域拆分为若干组件：

    * `AiPanel`：整体容器，负责上下区域拆分；
    * `StickerList`：显示贴纸列表（自动 + 手动）；
    * `StickerItem`：单条贴纸组件（含折叠 / 展开、内部滚动）；
    * `QaPanel` / `QaHistory` / `QaInput`：问答与总结区域；
  * 贴纸组件应支持：

    * `auto` / `manual` 两种类型的样式差异（如不同背景色 / 标签）；
    * 折叠 / 展开状态；
    * 内部滚动（max-height + `overflow-auto`）。
* **交互细节**：

  * 按钮 / 链接需有明确的 hover / active / disabled 状态；
  * 所有可点击区域在键盘导航与屏幕阅读器下可用（可后续逐步完善 a11y）；
  * 贴纸与左侧 PDF 的联动（点击贴纸滚动 PDF、点击页码引用跳转）在组件层体现为明确的回调 props（例如 `onJumpToPage(page, anchorRect?)`）。

---

## 7. 性能、监控与质量

* **性能基线**：

  * 典型 PDF（几十页）在桌面端浏览器的首屏加载时间控制在合理范围内（例如 ≤ 3 秒）；
  * AI 响应首 token 目标 ≤ 5 秒：

    * 调用 AI 接口时立即显示 loading 状态；
    * 超时（如 > 8–10 秒）需给出「仍在处理中」或重试入口。
* **PDF 渲染**：

  * 默认分页渲染（page-by-page），避免一次性渲染整份 PDF；
  * 滚动模式下，对大型 PDF 可考虑虚拟滚动或分批加载；
  * 与贴纸加载策略联动：

    * 初始只加载「当前页 ± 2 页」贴纸；
    * 向上 / 向下滚动时按需加载更多贴纸数据。
* **监控与日志（前端）**：

  * 至少记录 AI 调用失败的基础信息（接口、错误码、耗时），便于排查问题；
  * 针对「Explain this page」「explain-selection」「qa」「summarize-*」等关键路径增加埋点（可在 `features/ai` 内集中封装）；
  * 若后续接入前端监控（如 Sentry），优先上报严重 JS 错误和白屏问题。
* **国际化（i18n）准备**：

  * MVP 阶段不做多语言切换，但：

    * 用户可见文案集中管理（如 `/config/texts.ts` 或简单 i18n 文件）；
    * 避免在多个组件中重复硬编码相同文案。

---

## 8. AI 回复格式渲染与富文本支持

> 本节针对右侧 AI 面板（贴纸、问答、总结、提纲等）统一的富文本渲染能力与使用约定。

* **Markdown 渲染组件**：

  * 统一使用 `MarkdownRenderer` 组件（位于 `/src/components/markdown-renderer.tsx`）来渲染右侧 AI 面板中的所有**回复文本**；
  * 基于 `react-markdown`、`remark-math`、`remark-gfm`、`rehype-katex`、`rehype-raw` 实现，默认支持 GitHub 风格 Markdown、**完整 Markdown 语法**与数学公式。

* **LaTeX 数学公式**：

  * 支持行内公式：`$...$` 与 `\(...\)`；
  * 支持块级公式：`$$...$$` 与 `\[...\]`；
  * 使用 KaTeX（需引入 `katex/dist/katex.min.css`）进行渲染；
  * 要求 AI 回复中的公式语法尽量符合 KaTeX 能力范围，避免使用 KaTeX 明显不支持的宏。

* **代码语法高亮**：

  * 使用 `prism-react-renderer` 对代码块进行语法高亮，当前主题可使用 `vsLight` 或类似浅色主题；
  * 代码块统一使用三反引号语法并带上语言标记，例如：

    * ` ```python`、` ```javascript`、` ```typescript`、` ```java`、` ```cpp` 等；
  * 行内代码统一使用单反引号包裹，由组件渲染为等宽字体 + 浅背景的样式。

* **使用约定**：

  * 所有与 AI 相关的前端展示（包括但不限于：

    * 自动讲解贴纸（Explain this page）；
    * 选中文本讲解贴纸（From selection / 追问链）；
    * 基于当前 PDF 的问答回答；
    * 文档总结 / 章节总结 / 课程级提纲；）
      均不直接渲染 `innerHTML`，而是接收后端返回的 **纯文本 Markdown 字符串** 并交给 `MarkdownRenderer` 渲染；
  * 若后续新增 AI 能力（例如导出为带公式的讲义、生成学习 handout 等），应优先复用或扩展该组件，而非重新实现 Markdown / LaTeX / 代码高亮解析逻辑；
  * 与 PRD / API 设计（01 / 03 文档）中的「AI 文本 / 回复格式约定」保持一致：后端不返回 HTML，只返回 Markdown 文本。

---

> 本规范是 MVP 阶段的技术与代码基线。后续如果团队规模或功能复杂度明显上升，可以在本规范基础上补充更细致的组件设计规范（如表单 / 列表 / 弹窗模式）、状态管理约定（如引入 Zustand / Redux）、以及更严格的测试覆盖率目标（如行覆盖率 / 分支覆盖率），但应始终保持与 PRD / API 文档中对「PDF + AI 讲解 / 贴纸 / 问答 / 总结」的设计一致。
