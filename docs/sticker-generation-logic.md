# Sticker 生成逻辑与 AI 讲解机制详解

## 目录
1. [概述](#概述)
2. [Sticker 数据结构](#sticker-数据结构)
3. [自动生成 Sticker (Auto Sticker)](#自动生成-sticker-auto-sticker)
4. [手动生成 Sticker (Manual Sticker)](#手动生成-sticker-manual-sticker)
5. [Follow-up 问答机制](#follow-up-问答机制)
6. [配额管理](#配额管理)
7. [前端交互流程](#前端交互流程)

---

## 概述

**Sticker** 是 Student Aid 项目的核心功能，它是一种智能注释系统，用于在 PDF 文档上提供 AI 生成的解释和说明。系统支持两种类型的 Sticker：

- **Auto Sticker（自动贴纸）**：AI 自动分析整个页面，识别 2-6 个关键概念并生成解释
- **Manual Sticker（手动贴纸）**：用户选择特定文本，AI 针对性地解释该内容

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

## 自动生成 Sticker (Auto Sticker)

### 1. 触发流程

用户点击 **"Explain This Page"** 按钮 → 前端调用 `/api/ai/explain-page`

### 2. 后端处理流程

**文件位置**: `src/app/api/ai/explain-page/route.ts`

```
┌─────────────────────────────────────────────────────────────┐
│ 1. 验证用户身份和文件权限                                      │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. 检查缓存：该页面是否已有 auto stickers？                    │
│    - 如果有：直接返回缓存结果，不消耗配额                       │
│    - 如果没有：继续下一步                                      │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. 检查配额 (autoExplain bucket)                             │
│    - 默认限制：300次/月                                        │
│    - 如果超额：返回 429 错误                                   │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. 从 Supabase Storage 下载 PDF 文件                         │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. 提取页面文本 (使用 pdf-parse)                              │
│    - 检查文本长度 ≥ 50 字符                                    │
│    - 如果文本不足：返回错误                                     │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. 构建 AI Prompt (buildExplainPagePrompt)                   │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. 调用 OpenAI API (GPT-4)                                   │
│    - Model: gpt-4o                                           │
│    - Temperature: 0.7                                        │
│    - Max Tokens: 4000                                        │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 8. 解析 AI 响应 (parseExplainPageResponse)                   │
│    - 提取 JSON 格式的解释列表                                  │
│    - 每个解释包含：anchorText + explanation                   │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 9. 批量创建 Sticker 记录到数据库                              │
│    - type: 'auto'                                            │
│    - depth: 0                                                │
│    - folded: false                                           │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 10. 扣除配额 (deductQuota)                                    │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 11. 返回创建的 Stickers + 配额信息                            │
└─────────────────────────────────────────────────────────────┘
```

### 3. AI Prompt 构建

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

### 4. 响应解析

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

### 3. Prompt 构建

#### 首次提问 Prompt

```typescript
function buildExplainSelectionPrompt(context: {
  selectedText: string
  pageText: string
  pageNumber: number
  pdfType: 'Lecture' | 'Homework' | 'Exam' | 'Other'
  depth: number
}): string
```

**Prompt 示例**：
```
You are an expert educational AI tutor helping a student understand lecture notes.

The student has selected the following text and wants it explained:

SELECTED TEXT:
"F = ma"

SURROUNDING CONTEXT (Page 5):
---
[页面上下文文本，最多2000字符]
---

Provide a clear, helpful explanation that:
1. Directly addresses what the selected text means
2. Provides context for why it matters
3. Uses examples where helpful
4. Includes relevant mathematical formulas in LaTeX when applicable

Format your response in Markdown:
- Use headers (##, ###) to organize if the explanation has multiple parts
- Use bullet points for lists
- Use **bold** for key terms
- Use LaTeX for math: $inline$ or $$block$$
- Keep the explanation concise but thorough (150-400 words)
```

#### Follow-up Prompt

```typescript
function buildFollowUpPrompt(context: {
  selectedText: string
  pageText: string
  pageNumber: number
  pdfType: string
  parentContent: string
  depth: number
}): string
```

**Prompt 示例**：
```
You are an expert educational AI tutor. A student is asking a follow-up question about a previous explanation.

PREVIOUS EXPLANATION:
---
[父 Sticker 的内容]
---

STUDENT'S FOLLOW-UP QUESTION/SELECTION:
"What does acceleration mean in this context?"

Current follow-up depth: 1/10

Provide a focused explanation that:
1. Directly addresses the student's specific question
2. Builds on the previous explanation without unnecessary repetition
3. Goes deeper into the specific concept being asked about
4. Uses examples and analogies where helpful

Format in Markdown with LaTeX for any mathematical expressions.
Keep the response focused and concise (100-300 words).
```

### 4. 流式响应机制

**前端接收流式数据**：

```typescript
// src/features/stickers/api.ts
export async function explainSelection(
  params: {...},
  onChunk: (chunk: string) => void,      // 每次收到文本块时调用
  onComplete: (stickerId: string) => void // 完成时调用
): Promise<void> {
  const response = await fetch('/api/ai/explain-selection', {...})
  
  const stickerId = response.headers.get('X-Sticker-Id')
  
  // 解析 SSE 流
  for await (const chunk of parseSSEStream(response)) {
    if (chunk.content) {
      onChunk(chunk.content)  // 实时显示生成的文本
    }
    if (chunk.done && stickerId) {
      onComplete(stickerId)
    }
  }
}
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

### 3. 前端交互

**文件位置**: `src/features/stickers/components/sticker-card.tsx`

```typescript
// 用户在 Sticker 内容中选择文本
const handleTextSelection = () => {
  const selection = window.getSelection()
  if (selection && !selection.isCollapsed && onFollowUp) {
    const selectedText = selection.toString().trim()
    if (selectedText.length > 0) {
      onFollowUp(selectedText)  // 触发 follow-up 请求
    }
  }
}
```

### 4. 深度限制

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

**检查逻辑**：
1. 查询用户的配额记录
2. 如果不存在，创建默认配额
3. 检查 `used < limit`
4. 返回是否允许 + 当前配额状态

### 3. 配额扣除

**文件位置**: `src/lib/quota/deduct.ts`

```typescript
export async function deductQuota(
  supabase: SupabaseClient,
  userId: string,
  bucket: QuotaBucket
): Promise<{ quota: QuotaInfo }>
```

**扣除逻辑**：
- 使用数据库函数 `increment_quota_used()` 原子性地增加 `used` 计数
- 如果配额不存在，自动创建并设置为 1

### 4. 缓存优化

**Auto Sticker 缓存机制**：
```typescript
// 检查该页面是否已有 auto stickers
const { data: existingStickers } = await supabase
  .from('stickers')
  .select('*')
  .eq('file_id', fileId)
  .eq('page', page)
  .eq('type', 'auto')

if (existingStickers && existingStickers.length > 0) {
  // 直接返回缓存结果，不消耗配额
  return successResponse({
    stickers: existingStickers,
    cached: true
  })
}
```

---

## 前端交互流程

### 1. Auto Sticker 生成流程

```typescript
// src/features/stickers/hooks/use-explain-page.ts
export function useExplainPage() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (params: {
      courseId: string
      fileId: string
      page: number
      pdfType: 'Lecture' | 'Homework' | 'Exam' | 'Other'
    }) => {
      const result = await stickersApi.explainPage(params)
      return result.data
    },
    onSuccess: (data, variables) => {
      // 更新 Stickers 缓存
      queryClient.setQueryData(['stickers', variables.fileId], ...)
      
      // 更新配额缓存
      queryClient.setQueryData(['quotas'], ...)
    }
  })
}
```

**使用示例**：
```typescript
const explainPage = useExplainPage()

const handleExplainPage = () => {
  explainPage.mutate({
    courseId: '...',
    fileId: '...',
    page: 5,
    pdfType: 'Lecture'
  })
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

**关键代码**：
```typescript
<div
  className={`rounded-lg border ${depth > 0 ? 'ml-4 border-l-4' : ''}`}
  style={{
    borderLeftColor: depth > 0 ? (isAutoSticker ? '#93c5fd' : '#c4b5fd') : undefined
  }}
>
  {/* Header */}
  <div onClick={handleToggle}>
    <span className="badge">{isAutoSticker ? 'Auto' : 'Manual'}</span>
    <span>{sticker.anchor.textSnippet}</span>
  </div>
  
  {/* Content */}
  {isExpanded && (
    <div onMouseUp={handleTextSelection}>
      <MarkdownRenderer content={sticker.contentMarkdown} />
      <p>Select text to ask a follow-up question</p>
    </div>
  )}
</div>
```

### 4. 流式 Sticker 组件

**文件位置**: `src/features/stickers/components/streaming-sticker.tsx`

用于实时显示正在生成的 Manual Sticker 内容：

```typescript
export function StreamingSticker({ content, isComplete }: {
  content: string
  isComplete: boolean
}) {
  return (
    <div className="streaming-sticker">
      <MarkdownRenderer content={content} />
      {!isComplete && <div className="loading-indicator">●●●</div>}
    </div>
  )
}
```

---

## 总结

### Auto Sticker 工作流程
1. 用户点击 "Explain This Page"
2. 系统检查缓存 → 检查配额
3. 提取页面文本 → 构建 Prompt
4. 调用 OpenAI API（非流式）
5. 解析 JSON 响应，批量创建 2-6 个 Stickers
6. 扣除配额，返回结果

### Manual Sticker 工作流程
1. 用户选择文本
2. 系统检查配额 → 提取页面上下文
3. 构建 Prompt（首次或 Follow-up）
4. 预先创建 Sticker 记录
5. 调用 OpenAI Streaming API
6. 通过 SSE 实时传输给前端
7. 完成后更新 Sticker 内容，扣除配额

### 核心特性
- ✅ **智能缓存**：Auto Sticker 每页只生成一次
- ✅ **流式响应**：Manual Sticker 实时显示生成过程
- ✅ **层级问答**：支持最多 10 层 Follow-up
- ✅ **配额管理**：防止滥用，每月自动重置
- ✅ **Markdown + LaTeX**：支持丰富的格式化内容
- ✅ **类型区分**：Auto 和 Manual 有不同的样式和行为

---

## 相关文件索引

### 后端 API
- `/api/ai/explain-page/route.ts` - Auto Sticker 生成
- `/api/ai/explain-selection/route.ts` - Manual Sticker 生成
- `/api/ai/stickers/route.ts` - Sticker CRUD 操作

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
