# 未实现的功能清单

本文档记录了原始完整提案中**未实现**的功能，这些功能在本次更新中被排除，可能在未来的更新中实现。

---

## 1. 图片提取与分析（Mode-Based）

### 功能描述
- 从 PDF 页面提取嵌入的图片
- 使用 GPT-4o Vision 进行多模态分析
- 为图表、图示、公式生成 AI 解释

### 技术方案
- **Mode 维度**: `text_only` | `with_images`
- **图片提取**: 使用 pdf-lib 提取嵌入图片（不渲染页面）
- **多模态提示**: 同时发送文本和图片到 GPT-4o
- **图片摘要**: 生成英文图片摘要作为内部上下文

### 未实现原因
- 成本增加（GPT-4o Vision 更贵）
- 复杂度高（需要图片处理管道）
- MVP 优先文本分析

### 相关模块
- `src/lib/pdf/extract-images.ts` - 图片提取
- `src/lib/pdf/image-summary.ts` - 图片摘要生成
- Mode 参数添加到 API

---

## 2. PDF 结构解析

### 功能描述
- 解析 PDF 书签/目录
- 识别章节和节标题
- 构建文档层次结构

### 技术方案
- **两层回退策略**:
  1. 主要：提取书签/大纲（高置信度）
  2. 回退：正则表达式检测标题（中等置信度）
- **扫描 PDF**: 自动检测并跳过（低置信度）
- **存储**: `files.structure_data` (JSONB)

### 未实现原因
- 并非所有 PDF 都有清晰结构
- 解析算法复杂
- MVP 可以逐页处理

### 相关模块
- `src/lib/pdf/structure-parser.ts`
- `files` 表新增字段：`structure_parsed`, `structure_data`, `structure_confidence`

---

## 3. 会话上下文（跨页面）

### 功能描述
- 维护页面间的上下文连续性
- AI 可以引用前面页面的内容
- 使用 PDF 原文（而非之前的 sticker）

### 技术方案
- **上下文层级**:
  - 当前页面：完整文本
  - 章节上下文：压缩摘要
  - 全局术语表：关键术语
- **Token 限制**: 硬限制 2000 tokens
- **优先级分配**: 当前页 > 章节 > 全局
- **提取式摘要**: 使用 TF-IDF 压缩

### 未实现原因
- 增加延迟（需提取多页内容）
- Token 管理复杂
- MVP 每页独立即可

### 相关模块
- `src/lib/pdf/context-builder.ts`
- `shared_image_summaries` 表（图片上下文）

---

## 4. 多语言扩展（超出 en/zh-Hans）

### 功能描述
- 支持更多语言（日语、韩语、法语等）
- 自动翻译机制
- 跨语言缓存复用

### 技术方案
- **原生生成**: 目前仅 en 和 zh-Hans
- **翻译层**: 从英文缓存翻译到其他语言
- **备用方案**: 所有语言原生生成

### 未实现原因
- MVP 仅需双语（英文+简中）
- 翻译质量难保证
- 成本考虑

### 相关模块
- `src/lib/i18n/translation.ts` - 翻译层
- Locale 验证扩展

---

## 5. 修订跟踪与手动重新生成

### 功能描述
- 用户手动触发重新生成
- 保留历史修订版本
- 审计日志记录

### 技术方案
- **修订字段**:
  - `revision`: 修订号（1, 2, 3...）
  - `is_active`: 是否为最新版本
  - `superseded_by`: 指向新修订
- **审计日志**: `regenerate_audit_logs` 表
- **清理策略**: 保留最近 3 个修订

### 未实现原因
- 增加存储开销
- UI 复杂度高
- MVP 不需要质量控制

### 相关模块
- `shared_auto_stickers` 表的修订字段
- `regenerate_audit_logs` 表
- API 端点：`POST /api/ai/explain-page/regenerate`
- 前端"重新生成"按钮

---

## 6. 自动刷新机制

### 功能描述
- Prompt 升级后自动刷新缓存
- 后台自动重新生成
- 用户透明更新

### 技术方案
- 监控 `prompt_version` 变化
- 后台 worker 重新生成旧版本
- 用户下次访问获得新版本

### 未实现原因
- 成本高（批量重新生成）
- 复杂度高（后台调度）
- MVP 用户手动触发即可

---

## 7. 监控告警

### 功能描述
- 实时告警（僵尸任务、失败率飙升）
- Email/Slack 通知
- 自动化响应

### 技术方案
- 监控阈值：
  - 僵尸任务 > 10/小时
  - 失败率 > 10%
  - reference_count 异常
- 通知渠道：Email、Slack
- 自动恢复：重启 worker

### 未实现原因
- MVP 仅需仪表板
- 告警基础设施复杂
- 可通过手动监控

### 相关模块
- 告警规则配置
- 通知服务集成

---

## 8. 规范文档垃圾回收（GC）

### 功能描述
- 自动清理零引用的 canonical_documents
- 双重条件：`reference_count=0` 且 30 天未访问

### 技术方案
```sql
DELETE FROM canonical_documents
WHERE reference_count = 0
AND last_accessed_at < NOW() - INTERVAL '30 days'
AND last_reference_at < NOW() - INTERVAL '30 days';
```

### 未实现原因
- MVP 存储成本可接受
- 需谨慎避免误删
- 可手动执行

### 相关模块
- 定时清理任务（每月）
- 安全检查逻辑

---

## 实现优先级建议

### P0 (下一个版本)
1. **图片提取与分析** - 提升教育材料覆盖率
2. **修订跟踪** - 提供质量控制

### P1 (中期)
3. **会话上下文** - 改善多页文档体验
4. **PDF 结构解析** - 利用文档层次结构

### P2 (长期)
5. **多语言扩展** - 扩大用户群
6. **监控告警** - 提升运维能力
7. **自动刷新** - 优化缓存质量
8. **GC 机制** - 控制存储成本

---

## 相关文档

- **已实现功能**: 见 `proposal.md` 和 `tasks.md`
- **完整架构**: 见 `architecture.md`
- **变更总结**: 见 `CHANGES_SUMMARY.md`
- **技术文档**: `docs/sticker-generation-logic.md`

---

**最后更新**: 2026-01-11  
**维护者**: 开发团队
