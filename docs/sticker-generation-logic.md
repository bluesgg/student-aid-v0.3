# Sticker 生成逻辑与 AI 讲解机制详解

## 目录
1. [概述](#概述)
2. [Sticker 数据结构](#sticker-数据结构)
3. [跨用户内容去重与共享缓存](#跨用户内容去重与共享缓存)
4. [自动生成 Sticker (Auto Sticker)](#自动生成-sticker-auto-sticker)
5. [手动生成 Sticker (Manual Sticker)](#手动生成-sticker-manual-sticker)
6. [Follow-up 问答机制](#follow-up-问答机制)
7. [配额管理](#配额管理)
8. [后台 Worker 处理](#后台-worker-处理)
9. [监控与指标](#监控与指标)
10. [前端交互流程](#前端交互流程)

---

## 概述

**Sticker** 是 Student Aid 项目的核心功能，它是一种智能注释系统，用于在 PDF 文档上提供 AI 生成的解释和说明。系统支持两种类型的 Sticker：

- **Auto Sticker（自动贴纸）**：AI 自动分析整个页面，识别 2-6 个关键概念并生成解释
- **Manual Sticker（手动贴纸）**：用户选择特定文本，AI 针对性地解释该内容

### v2.0 新特性：跨用户内容去重

系统采用 **内容哈希去重** 技术，当不同用户上传相同的 PDF 时，共享 AI 生成的 Sticker，从而：
- 减少重复 AI 调用成本
- 提升后续用户的响应速度
- 通过异步生成避免长时间阻塞

---

## Sticker 数据结构

### 数据库表结构 (`stickers` 表)

```sql
CREATE TABLE stickers (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  course_id UUID NOT NULL,
  file_id UUID NOT NULL,
  type sticker_type NOT NULL,        -- 'auto' 或 'manual'
  page INTEGER NOT NULL,              -- 页码
  anchor_text TEXT NOT NULL,          -- 锚点文本（最多100字符）
  anchor_rect JSONB,                  -- 锚点位置（可选）
  parent_id UUID,                     -- 父 Sticker ID（用于 follow-up）
  content_markdown TEXT NOT NULL,     -- Markdown 格式的解释内容
  folded BOOLEAN DEFAULT FALSE,       -- 是否折叠
  depth INTEGER DEFAULT 0,            -- Follow-up 深度（最大10层）
  created_at TIMESTAMPTZ
);
```

### TypeScript 接口

```typescript
export interface Sticker {
  id: string
  type: 'auto' | 'manual'
  page: number
  anchor: {
    textSnippet: string
    rect?: { x: number; y: number; width: number; height: number } | null
  }
  parentId: string | null
  contentMarkdown: string  // 支持 Markdown 和 LaTeX 数学公式
  folded: boolean
  depth: number
  createdAt: string
}
```

---

## 跨用户内容去重与共享缓存

### 核心概念

当用户上传 PDF 时，系统计算文件的 **SHA-256 哈希值**（基于二进制内容）。相同内容的 PDF 共享同一个 `pdf_hash`，从而实现：

1. **Canonical Documents（规范文档）**：每个唯一 PDF 内容只存储一次元数据
2. **Shared Auto Stickers（共享自动贴纸）**：跨用户复用 AI 生成的 Sticker

### 数据库架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                        canonical_documents                          │
│  - pdf_hash (PK)                                                    │
│  - reference_count (当前引用的 files 数量)                           │
│  - total_pages                                                      │
│  - metadata (JSONB)                                                 │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                ┌───────────────────┼───────────────────┐
                ↓                   ↓                   ↓
┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐
│  files (User A)    │  │  files (User B)    │  │  files (User C)    │
│  content_hash →────┼──┼──→ pdf_hash        │  │  content_hash →────┤
└────────────────────┘  └────────────────────┘  └────────────────────┘
                                    │
                                    ↓
┌─────────────────────────────────────────────────────────────────────┐
│                      shared_auto_stickers                            │
│  Cache Key: (pdf_hash, page, prompt_version, locale, effective_mode) │
│  - status: 'generating' | 'ready' | 'failed'                        │
│  - stickers_json: 生成的 Sticker 数据                                │
└─────────────────────────────────────────────────────────────────────┘
```

### 缓存维度

共享缓存的键由以下维度组成：
- `pdf_hash`: PDF 内容的 SHA-256 哈希
- `page`: 页码
- `prompt_version`: Prompt 版本号（如 "2026-01-11.1"）
- `locale`: 语言（'en' | 'zh-Hans'）
- `effective_mode`: 处理模式（'text_only' | 'text_heavy' | 'image_heavy' | 'image_only'）

### Effective Mode 决策

基于页面词数和图片检测确定处理模式：

| 条件 | Effective Mode |
|------|----------------|
| 纯图片页（词数 < 50） | `image_only` |
| 图片为主（词数 50-200） | `image_heavy` |
| 文字为主（词数 200-1000） | `text_heavy` |
| 纯文字页（词数 > 1000） | `text_only` |

---

## 自动生成 Sticker (Auto Sticker)

### 1. 触发流程

用户点击 **"Explain This Page"** 按钮 → 前端调用 `/api/ai/explain-page`

### 2. 后端处理流程（v2.0 异步工作流）

**文件位置**: `src/app/api/ai/explain-page/route.ts`

```
┌─────────────────────────────────────────────────────────────┐
│ 1. 验证用户身份和文件权限                                      │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. 检查配额 (autoExplain bucket) - Fail Fast                │
│    - 如果超额：立即返回 429 错误                               │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. 检查用户私有缓存：该页面是否已有 auto stickers？             │
│    - 如果有：直接返回 200 + stickers，不消耗配额               │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. 检查共享缓存（仅对有 content_hash 的新文件）                │
│    a. 检查用户 opt-out 偏好                                  │
│    b. 确定 effective_mode                                    │
│    c. 查询 shared_auto_stickers                             │
│       - status='ready' → 返回 200 + stickers                │
│       - status='generating' → 返回 202 + generationId       │
│       - 未找到 → 继续下一步                                   │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. 启动异步生成 (Single-Flight Pattern)                     │
│    - 原子创建 shared_auto_stickers 记录 (status='generating')│
│    - 预扣配额                                                │
│    - 返回 202 + generationId                                │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. 客户端轮询 /api/ai/explain-page/status/:generationId     │
│    - 每 2 秒轮询一次                                         │
│    - 直到 status='ready' 或 'failed'                        │
└─────────────────────────────────────────────────────────────┘
```

### 3. 响应类型

#### 同步成功（缓存命中）：HTTP 200
```json
{
  "ok": true,
  "data": {
    "stickers": [...],
    "quota": { "autoExplain": { "used": 146, "limit": 300 } },
    "cached": true,
    "source": "shared_cache"
  }
}
```

#### 异步处理中：HTTP 202
```json
{
  "ok": true,
  "status": "generating",
  "generationId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Sticker generation in progress. Poll /api/ai/explain-page/status/:generationId for updates.",
  "pollInterval": 2000
}
```

### 4. AI Prompt 构建

**文件位置**: `src/lib/openai/prompts/explain-page.ts`

```typescript
function buildExplainPagePrompt(context: {
  pageText: string
  pageNumber: number
  pdfType: 'Lecture' | 'Homework' | 'Exam' | 'Other'
  totalPages: number
}): string
```

**Prompt 结构**：
```
You are an expert educational AI tutor. Analyze the following page from [lecture/homework/exam] 
and identify 2-6 key concepts, terms, or ideas that a student might need explained.

For each concept, provide a clear, helpful explanation that:
1. Defines the concept in simple terms
2. Explains its significance or context
3. Uses examples where helpful
4. Includes relevant mathematical formulas in LaTeX when applicable

PAGE X OF Y:
---
[页面文本内容]
---

Respond in JSON format:
{
  "explanations": [
    {
      "anchorText": "the exact text phrase from the page being explained (max 100 chars)",
      "explanation": "your explanation in Markdown format with LaTeX math ($...$ for inline, $$...$$ for block)"
    }
  ]
}

Guidelines:
- Focus on concepts that are central to understanding the page
- Keep explanations concise but thorough (100-300 words each)
- Use proper Markdown formatting (headers, lists, bold/italic)
- Use LaTeX for all mathematical expressions
- If this is a homework/exam page, explain the problem-solving approach rather than giving answers
- Return between 2 and 6 explanations based on content density
```

### 5. 响应解析

AI 返回的 JSON 会被解析为：

```typescript
{
  explanations: [
    {
      anchorText: "Newton's Second Law",
      explanation: "## Newton's Second Law\n\n**F = ma** states that force equals mass times acceleration...\n\n$$F = ma$$"
    },
    // ... 更多解释
  ]
}
```

---

## 手动生成 Sticker (Manual Sticker)

### 1. 触发流程

用户在 PDF 或已有 Sticker 中**选择文本** → 前端调用 `/api/ai/explain-selection`

### 2. 后端处理流程（流式响应）

**文件位置**: `src/app/api/ai/explain-selection/route.ts`

```
┌─────────────────────────────────────────────────────────────┐
│ 1. 验证用户身份和文件权限                                      │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. 检查是否为 Follow-up 问题                                  │
│    - 如果有 parentId：查询父 Sticker，depth = parent.depth + 1│
│    - 检查深度限制（最大 10 层）                                │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. 检查配额 (learningInteractions bucket)                    │
│    - 默认限制：150次/月                                        │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. 提取页面上下文文本（可选）                                  │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. 构建 Prompt                                               │
│    - 首次提问：buildExplainSelectionPrompt                    │
│    - Follow-up：buildFollowUpPrompt                          │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. 预先创建 Sticker 记录（content_markdown 为空）             │
│    - type: 'manual'                                          │
│    - parent_id: 如果是 follow-up，则指向父 Sticker            │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. 调用 OpenAI Streaming API                                 │
│    - stream: true                                            │
│    - 实时返回生成的文本块                                      │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 8. 通过 SSE (Server-Sent Events) 流式传输给前端              │
│    - 响应头包含 X-Sticker-Id                                  │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 9. 流式传输完成后                                             │
│    - 更新 Sticker 的 content_markdown                         │
│    - 扣除配额                                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Follow-up 问答机制

### 1. 层级结构

Sticker 支持多层嵌套的 Follow-up 问答：

```
Auto Sticker (depth: 0)
  └─ Manual Sticker (depth: 1) - 用户对 Auto Sticker 提问
       └─ Manual Sticker (depth: 2) - 用户对上一个回答继续提问
            └─ Manual Sticker (depth: 3)
                 └─ ... (最多 10 层)
```

### 2. 数据库关系

```sql
-- 父子关系通过 parent_id 建立
parent_id UUID REFERENCES stickers(id) ON DELETE CASCADE
```

**级联删除**：删除父 Sticker 时，所有子 Sticker 也会被删除

### 3. 深度限制

```typescript
const MAX_FOLLOW_UP_DEPTH = 10

if (depth > MAX_FOLLOW_UP_DEPTH) {
  return errors.custom(
    'MAX_DEPTH_REACHED',
    `Follow-up depth limit of ${MAX_FOLLOW_UP_DEPTH} reached`,
    400
  )
}
```

---

## 配额管理

### 1. 配额类型

| Bucket 名称 | 用途 | 默认限制 | 重置周期 |
|------------|------|---------|---------|
| `autoExplain` | Auto Sticker 生成 | 300次/月 | 每月重置 |
| `learningInteractions` | Manual Sticker 生成 | 150次/月 | 每月重置 |
| `documentSummary` | 文档摘要 | 100次/月 | 每月重置 |
| `sectionSummary` | 章节摘要 | 65次/月 | 每月重置 |
| `courseSummary` | 课程摘要 | 15次/月 | 每月重置 |

### 2. 配额检查流程

**文件位置**: `src/lib/quota/check.ts`

```typescript
export async function checkQuota(
  supabase: SupabaseClient,
  userId: string,
  bucket: QuotaBucket
): Promise<{
  allowed: boolean
  quota: { used: number; limit: number; resetAt: string }
}>
```

### 3. 异步生成的配额处理

对于异步生成流程：
1. **预扣配额**：在 `tryStartGeneration` 时立即扣除
2. **失败退款**：如果生成失败，通过 `failGeneration(id, error, refund=true)` 退还配额
3. **跟踪记录**：通过 `explain_requests` 表记录每次请求，用于审计和退款

---

## 后台 Worker 处理

### 1. Worker 架构

**文件位置**: `src/lib/worker/sticker-worker.ts`

后台 Worker 负责处理异步 Sticker 生成任务：

```
┌─────────────────────────────────────────────────────────────┐
│                     Worker Process                          │
├─────────────────────────────────────────────────────────────┤
│  1. pickupJobs() - 获取待处理任务                            │
│     - SELECT ... FOR UPDATE SKIP LOCKED                     │
│     - 原子锁定避免重复处理                                    │
├─────────────────────────────────────────────────────────────┤
│  2. processJob() - 处理单个任务                              │
│     - 下载 PDF                                              │
│     - 提取页面文本                                           │
│     - 调用 OpenAI API                                       │
│     - 保存结果到 shared_auto_stickers                        │
├─────────────────────────────────────────────────────────────┤
│  3. 错误处理与重试                                           │
│     - 瞬态错误：指数退避重试                                  │
│     - 永久错误：标记失败 + 退款                               │
├─────────────────────────────────────────────────────────────┤
│  4. cleanupZombies() - 清理僵尸任务                          │
│     - 锁定超过 15 分钟的任务                                  │
└─────────────────────────────────────────────────────────────┘
```

### 2. 触发方式

**API 端点**: `POST /api/internal/worker/run`

```bash
# 通过 Cron 服务定期触发
curl -X POST https://your-app.com/api/internal/worker/run \
  -H "Authorization: Bearer $WORKER_SECRET"
```

### 3. 重试策略

| 错误类型 | 示例 | 处理方式 |
|---------|------|---------|
| 瞬态错误 | 网络超时、API 限流 | 指数退避重试（最多 3 次） |
| 永久错误 | 无效内容、解析失败 | 立即标记失败 + 退款 |

重试延迟公式：
```typescript
const delay = BASE_DELAY * Math.pow(2, attempts) + randomJitter(0, 1000)
// 第1次: ~15秒, 第2次: ~30秒, 第3次: ~60秒
```

---

## 监控与指标

### 1. 指标收集

**文件位置**: `src/lib/metrics/sticker-metrics.ts`

收集的指标包括：
- **缓存性能**：命中率、未命中率
- **生成统计**：成功率、失败率、重试次数
- **延迟分布**：P50、P95、P99
- **Worker 健康**：待处理任务数、僵尸任务数

### 2. 管理员 API

**端点**: `GET /api/admin/metrics`

```bash
curl https://your-app.com/api/admin/metrics \
  -H "x-admin-secret: $ADMIN_SECRET" \
  -G -d "period=day" -d "include=all"
```

**响应示例**：
```json
{
  "ok": true,
  "data": {
    "metrics": {
      "period": "day",
      "cacheHitRate": 0.75,
      "successRate": 0.98,
      "avgLatencyMs": 2500,
      "p95LatencyMs": 8000
    },
    "workerHealth": {
      "isHealthy": true,
      "pendingJobs": 3,
      "stuckJobs": 0
    },
    "cacheEfficiency": {
      "totalCanonicalDocs": 150,
      "avgReferencesPerDoc": 2.5,
      "estimatedCostSavings": 3.75
    }
  }
}
```

### 3. 延迟采样

系统在以下时机记录延迟样本：
- 缓存命中时
- 同步生成完成时
- 异步生成完成时

采样数据存储在 `sticker_latency_samples` 表，30 天后自动清理。

---

## 前端交互流程

### 1. Auto Sticker 生成流程（异步）

```typescript
// src/features/stickers/hooks/use-explain-page.ts
async function explainPage(params: ExplainPageParams) {
  const response = await fetch('/api/ai/explain-page', {
    method: 'POST',
    body: JSON.stringify(params),
  })

  if (response.status === 200) {
    // 同步完成或缓存命中
    return await response.json()
  }

  if (response.status === 202) {
    // 异步生成中，开始轮询
    const { generationId, pollInterval } = await response.json()
    return await pollForCompletion(generationId, pollInterval)
  }

  throw new Error('Request failed')
}

async function pollForCompletion(generationId: string, interval: number = 2000) {
  const maxAttempts = 150 // 5 minutes
  let attempts = 0

  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, interval))
    
    const response = await fetch(`/api/ai/explain-page/status/${generationId}`)
    const data = await response.json()

    if (data.status === 'ready') {
      return data
    }
    
    if (data.status === 'failed') {
      throw new Error(data.error)
    }

    attempts++
  }

  throw new Error('Polling timeout')
}
```

### 2. Manual Sticker 生成流程（流式）

```typescript
// src/features/stickers/hooks/use-explain-selection.ts
export function useExplainSelection() {
  return useMutation({
    mutationFn: async (params: {
      courseId: string
      fileId: string
      page: number
      selectedText: string
      parentId?: string | null
      pdfType: PdfType
      onChunk: (chunk: string) => void
    }) => {
      let fullContent = ''
      
      await stickersApi.explainSelection(
        { ...params },
        (chunk) => {
          fullContent += chunk
          params.onChunk(chunk)  // 实时更新 UI
        },
        (stickerId) => {
          // 完成后的回调
        }
      )
      
      return fullContent
    }
  })
}
```

### 3. Sticker 展示组件

**文件位置**: `src/features/stickers/components/sticker-card.tsx`

**功能**：
- ✅ 显示 Sticker 类型标签（Auto/Manual）
- ✅ 显示锚点文本
- ✅ 折叠/展开内容
- ✅ 渲染 Markdown + LaTeX 数学公式
- ✅ 支持文本选择触发 Follow-up
- ✅ 删除 Sticker
- ✅ 层级缩进显示（通过 `depth` 属性）

---

## 总结

### Auto Sticker 工作流程（v2.0）
1. 用户点击 "Explain This Page"
2. 系统检查配额（fail fast）→ 检查用户缓存 → 检查共享缓存
3. 缓存命中：直接返回 200
4. 缓存未命中：启动异步生成，返回 202
5. 后台 Worker 处理：下载 PDF → 提取文本 → 调用 AI → 保存结果
6. 客户端轮询直到完成
7. 复制共享 Sticker 到用户私有表

### Manual Sticker 工作流程
1. 用户选择文本
2. 系统检查配额 → 提取页面上下文
3. 构建 Prompt（首次或 Follow-up）
4. 预先创建 Sticker 记录
5. 调用 OpenAI Streaming API
6. 通过 SSE 实时传输给前端
7. 完成后更新 Sticker 内容，扣除配额

### 核心特性
- ✅ **跨用户去重**：相同 PDF 共享 AI 生成结果
- ✅ **异步处理**：长任务不阻塞用户，返回 202
- ✅ **Single-Flight**：相同请求只生成一次
- ✅ **智能缓存**：多维度缓存键（hash + page + locale + mode）
- ✅ **流式响应**：Manual Sticker 实时显示生成过程
- ✅ **层级问答**：支持最多 10 层 Follow-up
- ✅ **配额管理**：预扣 + 失败退款
- ✅ **监控指标**：缓存命中率、延迟、Worker 健康状态
- ✅ **Markdown + LaTeX**：支持丰富的格式化内容

---

## 相关文件索引

### 后端 API
- `/api/ai/explain-page/route.ts` - Auto Sticker 生成（异步）
- `/api/ai/explain-page/status/[generationId]/route.ts` - 生成状态轮询
- `/api/ai/explain-selection/route.ts` - Manual Sticker 生成
- `/api/ai/stickers/route.ts` - Sticker CRUD 操作
- `/api/internal/worker/run/route.ts` - Worker 触发端点
- `/api/admin/metrics/route.ts` - 监控指标

### 核心模块
- `src/lib/pdf/hash.ts` - PDF 哈希计算
- `src/lib/pdf/page-metadata.ts` - 页面元数据和 effective_mode
- `src/lib/stickers/shared-cache.ts` - 共享缓存管理
- `src/lib/worker/sticker-worker.ts` - 后台 Worker
- `src/lib/metrics/sticker-metrics.ts` - 指标收集

### Prompt 工程
- `src/lib/openai/prompts/explain-page.ts` - Auto Sticker Prompt
- `src/lib/openai/prompts/explain-selection.ts` - Manual Sticker Prompt

### 前端 Hooks
- `src/features/stickers/hooks/use-explain-page.ts`
- `src/features/stickers/hooks/use-explain-selection.ts`
- `src/features/stickers/hooks/use-stickers.ts`

### 前端组件
- `src/features/stickers/components/sticker-card.tsx`
- `src/features/stickers/components/streaming-sticker.tsx`
- `src/features/stickers/components/explain-page-button.tsx`

### 配额管理
- `src/lib/quota/check.ts`
- `src/lib/quota/deduct.ts`

### 数据库
- `src/lib/supabase/migrations/001_initial_schema.sql`
- `src/lib/supabase/migrations/002_cross_user_content_deduplication.sql`
