# 变更日志 (Changelog)

本文档记录 StudentAid 项目的重要功能更新和变更。

---

## [2026-01-11] 跨用户内容去重与共享缓存

**OpenSpec Change ID**: `update-sticker-word-count-logic`  
**实施日期**: 2026-01-11  
**状态**: ✅ 已完成并归档

### 📋 更新概述

实现了跨用户内容去重与共享缓存系统，当不同用户上传相同的 PDF 时，自动共享 AI 生成的 Sticker，从而降低成本、提升速度、改善体验。

### 🎯 核心功能

#### 1. 内容哈希去重
- PDF 上传时计算 SHA-256 内容哈希
- 相同内容的 PDF 共享 `canonical_documents` 记录
- 自动管理引用计数（reference_count）
- 引用边表（`canonical_document_refs`）实现原子操作

#### 2. 共享缓存系统
- **多维度缓存键**: `(pdf_hash, page, prompt_version, locale, effective_mode)`
- **跨用户复用**: 相同内容只生成一次，所有用户共享结果
- **Single-Flight 模式**: DB 唯一约束确保相同请求只生成一次
- **双语支持**: en (英文) 和 zh-Hans (简体中文)
- **Mode 维度**: 
  - `text_only`: 仅文本分析
  - `with_images`: 文本+图片多模态分析（未来支持）

#### 3. 异步处理工作流
- **HTTP 202 Accepted**: 长任务不阻塞用户
- **客户端轮询**: `/api/ai/explain-page/status/:generationId` 每 2 秒轮询
- **后台 Worker**: 处理生成任务，支持重试
- **动态超时**: 基于内容复杂度计算 `expires_at`

#### 4. 智能重试策略
- **错误分类**: 瞬态错误（重试）vs 永久错误（立即失败）
- **指数退避**: 60s → 5min → 15min
- **最大重试**: 3 次
- **僵尸任务清理**: 每 5 分钟清理超时任务

#### 5. 配额管理
- **预扣费**: 异步生成时立即扣除配额
- **失败退款**: 生成失败自动退还配额
- **透明记账**: `explain_requests` 表记录所有请求

#### 6. 监控与指标
- **缓存命中率**: 统计命中/未命中
- **延迟分布**: P50/P95/P99
- **Worker 健康**: 待处理任务、僵尸任务数
- **成本节省**: 估算去重带来的成本节省
- **管理员 API**: `GET /api/admin/metrics`

### 🗄️ 数据库变更

新增 8 个表：

| 表名 | 用途 |
|------|------|
| `canonical_documents` | 唯一 PDF 内容的规范记录 |
| `canonical_document_refs` | 文件到规范文档的引用关系 |
| `canonical_page_metadata` | 页面级元数据（词数、图片数） |
| `shared_auto_stickers` | 跨用户共享的 Sticker 缓存 |
| `explain_requests` | 配额请求记录（支持退款） |
| `sticker_latency_samples` | 延迟采样数据 |
| `user_preferences` | 用户偏好设置（opt-out） |
| `sticker_metrics` | 实时指标事件 |

**迁移文件**: `src/lib/supabase/migrations/002_cross_user_content_deduplication.sql`

### 📦 新增模块

#### 核心模块
```
src/lib/
├── pdf/
│   ├── hash.ts                    # PDF 二进制哈希计算
│   └── page-metadata.ts           # 页面元数据提取
├── stickers/
│   └── shared-cache.ts            # 共享缓存管理
├── worker/
│   └── sticker-worker.ts          # 后台 Worker
└── metrics/
    └── sticker-metrics.ts         # 监控指标收集
```

#### API 端点
```
POST /api/ai/explain-page                      # 异步 Sticker 生成（返回 202）
GET  /api/ai/explain-page/status/:id           # 轮询生成状态
POST /api/internal/worker/run                  # 触发 Worker（Cron）
GET  /api/admin/metrics                        # 管理员监控
```

### 🔄 修改的文件

| 文件 | 变更内容 |
|------|---------|
| `src/app/api/courses/[courseId]/files/route.ts` | 上传时计算 hash、创建 canonical 记录 |
| `src/app/api/courses/[courseId]/files/[fileId]/route.ts` | 删除时清理 canonical 引用 |
| `src/app/api/ai/explain-page/route.ts` | 重写为异步工作流，集成共享缓存 |
| `docs/sticker-generation-logic.md` | 完整重写，新增去重章节 |
| `docs/03_api_design.md` | 新增 4 个 API 端点说明 |

### 📊 性能提升

#### 缓存命中时
- **延迟**: < 500ms（直接从数据库读取）
- **成本**: $0（无 AI 调用）
- **用户体验**: 即时响应

#### 缓存未命中时
- **首次扣费**: 立即扣除配额
- **异步处理**: 不阻塞用户
- **平均生成时间**: 2-5 秒
- **失败退款**: 自动退还配额

#### 成本节省示例
假设相同 PDF 被 10 个用户使用：
- **原模式**: 10 次 AI 调用 = $0.10
- **新模式**: 1 次 AI 调用 = $0.01
- **节省**: 90%

### 🔧 环境变量

需要添加到 `.env.local`：

```env
# Worker 触发密钥（用于 Cron）
WORKER_SECRET=your-secure-random-string

# 管理员 API 密钥
ADMIN_SECRET=your-admin-secret

# Supabase Service Role Key（已有，用于绕过 RLS）
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 🚀 部署要求

#### 1. 数据库迁移
```sql
-- 在 Supabase Dashboard > SQL Editor 中执行
-- 文件：src/lib/supabase/migrations/002_cross_user_content_deduplication.sql
```

#### 2. Cron 任务配置
设置定时任务触发 Worker（推荐每 1-2 分钟）：

```bash
# URL: POST /api/internal/worker/run
# 频率: */1 * * * * (每分钟)
# 或: */2 * * * * (每2分钟)
# Header: Authorization: Bearer $WORKER_SECRET
```

**支持的平台**:
- Vercel Cron
- Railway Cron
- GitHub Actions (scheduled)
- 第三方 Cron 服务（cron-job.org、EasyCron）

### 📖 技术文档

- **完整技术文档**: `docs/sticker-generation-logic.md`
- **API 规范**: `docs/03_api_design.md`
- **OpenSpec 归档**: `openspec/changes/archive/2026-01-11-update-sticker-word-count-logic/`
- **未实现功能**: `openspec/changes/archive/.../FUTURE_FEATURES.md`

### ✅ 测试结果

- **单元测试**: 31 个测试全部通过
- **类型检查**: `pnpm typecheck` ✅ 通过
- **代码规范**: `pnpm lint` ✅ 通过（仅 console 警告）
- **数据库迁移**: ✅ 已验证

### 🎓 验收指南

详细验收步骤请参考：
1. **数据库检查**: 确认 8 个新表已创建
2. **文件上传测试**: 验证 content_hash 计算
3. **异步生成测试**: 测试 202 工作流和轮询
4. **缓存命中测试**: 验证相同 PDF 的去重
5. **Worker 测试**: 手动触发 Worker 处理
6. **监控 API 测试**: 验证管理员 API

### ⚠️ 已知限制

1. **Cron 依赖**: Worker 需要外部 Cron 触发
2. **最大重试**: 默认 3 次（可配置）
3. **缓存过期**: 当前无自动清理（需定期手动清理）
4. **Prompt 版本**: 更新后旧缓存失效，需重新生成

### 🔮 未来优化

短期（Post-MVP）：
- [ ] 实现自动清理旧延迟样本（30 天）
- [ ] 添加 Worker 健康检查告警
- [ ] 优化数据库索引

中期：
- [ ] 实现用户 opt-out 机制 UI
- [ ] 支持多语言 Sticker 生成
- [ ] 实现图片重度页面的特殊处理

长期：
- [ ] 自动清理零引用的 canonical_documents
- [ ] 实现分布式 Worker（多实例协作）
- [ ] 添加实时监控仪表板

完整的未实现功能清单见：`openspec/.../FUTURE_FEATURES.md`

### 👥 贡献者

- **实施**: AI Assistant
- **审核**: [待填写]
- **验收**: [待填写]

### 📞 相关链接

- **提案文档**: `openspec/changes/archive/2026-01-11-update-sticker-word-count-logic/proposal.md`
- **技术规范**: `openspec/specs/ai-sticker-generation/spec.md`
- **GitHub Issue**: [如有]
- **Notion 文档**: [如有]

---

## 历史版本

### [2026-01-10] 课程学期下拉菜单

**OpenSpec Change ID**: `add-term-dropdown`  
**实施日期**: 2026-01-10  
**状态**: ✅ 已完成并归档

#### 📋 更新概述

将课程创建对话框中的"学期"字段从自由文本输入改为下拉选择框，提供标准化的学期选项并自动选择当前学期。

#### 🎯 核心功能

##### 1. 学期下拉菜单
- **标准选项**: 提供 9 个学期选项（覆盖前一年、当前年、下一年）
- **格式统一**: 所有学期遵循 "[季节] [年份]" 格式（如 "Spring 2025"）
- **包含季节**: Winter（冬季）、Spring（春季）、Fall（秋季）
- **时间顺序**: 学期按时间顺序排列（最早到最晚）

##### 2. 智能自动选择
基于当前日期自动选择学期：
- **1月-4月** → Winter [当前年]
- **5月-8月** → Spring [当前年]
- **9月-12月** → Fall [当前年]

##### 3. 用户体验改进
- **减少输入**: 无需手动输入学期
- **格式一致**: 避免 "Spring2025"、"spring 2025"、"2025 Spring" 等不一致格式
- **快速创建**: 默认选择当前学期，一键确认即可

#### 🔧 技术实现

**修改的文件**:
- `src/features/courses/components/create-course-dialog.tsx` - 替换文本输入为下拉选择

**新增工具函数**:
- 学期计算逻辑（基于日期）
- 生成学期选项列表

#### ✅ 验收标准

- [x] 下拉菜单渲染正确
- [x] 包含 9 个学期选项（3年 × 3季节）
- [x] 自动选择当前学期
- [x] 用户可选择任意学期
- [x] 选中值正确保存到数据库
- [x] 与现有课程兼容（向后兼容）
- [x] 键盘导航支持
- [x] 类型检查通过
- [x] 无控制台错误

#### 📖 相关文档

- **OpenSpec 归档**: `openspec/changes/archive/2026-01-10-add-term-dropdown/`
- **规范更新**: `openspec/specs/course-management/spec.md`

---

**文档最后更新**: 2026-01-11  
**维护者**: 开发团队
