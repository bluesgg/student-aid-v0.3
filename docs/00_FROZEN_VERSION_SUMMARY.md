# 文档冻结版本 - 关键修改摘要

> 基于四轮审计的最终修正版本
> 所有修改已应用，文档进入冻结状态

---

## 修改概览

### 事实错误修正（6处）
1. ✅ Token有效期：7天 → 30天（03_API, 04_TECH）
2. ✅ Cookie API：`set({name, value, options})` → `set(name, value, options)`（04_TECH）
3. ✅ 会话刷新：`getUser()` → `getSession()`（04_TECH）
4. ✅ PDF检测：删除不存在的`max`参数（04_TECH）
5. ✅ OpenAI streaming：添加usage字段注释（04_TECH）
6. ✅ Middleware数据库：删除不可行的db调用（04_TECH）

### 重复定义删除（5处）
1. ✅ 性能优化策略：01_PRD删除，引用04_TECH
2. ✅ 贴纸数据模型：01_PRD引用03_API
3. ✅ 扫描件检测：01_PRD引用04_TECH
4. ✅ Markdown格式：01_PRD引用03_API
5. ✅ 配额数值：04_TECH引用01_PRD

### 边界情况补充（11处）
1. ✅ 快速双击AI按钮 → 前端禁用直到响应返回
2. ✅ 已有贴纸再次生成 → 返回现有数据，不扣配额
3. ✅ AI streaming中断 → 已返回首token则扣配额
4. ✅ 贴纸折叠失败 → 乐观更新+重试3次+失败回滚
5. ✅ 配额显示不一致 → API返回429时更新本地状态
6. ✅ 多标签页操作 → 以数据库状态为准
7. ✅ 文件名冲突 → 返回409+弹出对话框
8. ✅ 总结生成中 → 返回409+禁用按钮
9. ✅ AI超时 → 返回504，不扣配额
10. ✅ OpenAI不可用 → 返回503，不扣配额
11. ✅ Supabase不可用 → 返回503

### 不一致性修正（17处）
1. ✅ Token有效期统一为30天
2. ✅ 配额重置机制明确（仅自动讲解每日重置）
3. ✅ 幂等机制说明（需Redis，MVP可降级）
4. ✅ 缓存行为定义（按userId+fileId+page）
5. ✅ Streaming配额扣除（以首token为准）
6. ✅ 邮箱验证过期时间（24小时）
7. ✅ 错误码统一清单（新增§6）
8. ✅ localStorage使用说明（禁止token，允许UI偏好）
9. ✅ 虚拟滚动依赖（添加react-window）
10. ✅ 限流实现机制（需Redis或降级）
11. ✅ 定时任务调度（需Cron Job）
12. ✅ window.fetch覆盖（改用TanStack Query）
13. ✅ Middleware日志（改在Route Handler）
14. ✅ 配额定义来源（01_PRD为权威）
15. ✅ 数据模型来源（03_API为权威）
16. ✅ 技术算法来源（04_TECH为权威）
17. ✅ 文档间引用规范（使用§编号）

---

## 冻结版本文件清单

### 已创建
- ✅ `01_light_prd_FROZEN.md` - PRD冻结版本

### 待创建（因篇幅限制）
- ⏳ `02_page_and_flow_design_FROZEN.md`
- ⏳ `03_api_design_FROZEN.md`
- ⏳ `04_tech_and_code_style_FROZEN.md`

---

## 关键修改详情

### 文档01: PRD

**§3.1 配额说明**
```markdown
* MVP阶段AI配额不重置,仅自动讲解每日00:00 UTC重置(需Cron Job实现,见04_TECH §13)
```

**§4.1 性能基线**
```markdown
**注**: 优化策略见04_TECH §10
```

**§2.3 贴纸机制**
```markdown
**数据模型**：见03_API §3.0.1
```

**§2.4 扫描件处理**
```markdown
* 上传时检测文本层可用性(检测算法见04_TECH §2.3)
```

**§2.5 富文本格式**
```markdown
所有AI输出统一为**Markdown文本**(格式规范见03_API §3.0.3)
```

### 文档02: 页面流程

**§5.2 自动讲解缓存**
```markdown
**持久化**：缓存行为见03_API §3.3(按userId+fileId+page检查,已有则返回,不扣配额和限流)
```

**§9.4 新增边界情况**
```markdown
### 9.4 边界情况

**重复请求**:
* 快速双击AI按钮→前端禁用直到响应返回
* 已有自动贴纸的页面再次点击→返回现有数据,不重新生成

**网络中断**:
* AI streaming中途断开→已返回首token则扣配额,否则不扣
* 贴纸折叠操作失败→前端乐观更新,后台重试3次,失败后回滚UI

**状态不一致**:
* 配额显示与实际不符→API返回429时更新本地状态
* 多标签页操作→以数据库状态为准,刷新时覆盖前端状态
```

### 文档03: API设计

**§1.1 Token有效期**
```markdown
* Supabase JWT(access token 1h + refresh token 30d)存储在httpOnly cookie
```

**§0 配额消耗原则**
```markdown
4. 防滥用：相同(userId+endpoint+参数hash)在5秒内的重复请求返回409(需Redis实现,MVP可降级为无幂等)
```

**§3.3 自动讲解缓存**
```markdown
**缓存检查**：查询数据库是否已有(userId,fileId,page)的自动贴纸,有则直接返回,不重新生成,不扣配额和限流计数
```

**§6 新增统一错误码清单**
```markdown
## 6. 统一错误码清单

| 错误码 | HTTP | 含义 | 前端行为 |
|--------|------|------|---------|
| UNAUTHORIZED | 401 | 未登录或token过期 | 清理状态+跳转/login |
| EMAIL_NOT_CONFIRMED | 403 | 邮箱未验证 | 显示"重发邮件"按钮 |
| QUOTA_EXCEEDED | 429 | 配额用尽 | 禁用按钮+显示剩余配额 |
| AUTO_EXPLAIN_LIMIT_REACHED | 429 | 自动讲解限流 | 仅禁用"Explain this page"按钮 |
| FILE_NAME_CONFLICT | 409 | 文件名冲突 | 弹出对话框(重命名/替换/取消) |
| SUMMARY_IN_PROGRESS | 409 | 总结生成中 | 显示"正在生成"并禁用按钮 |
| AI_TIMEOUT | 504 | AI请求超时 | 提示"请求超时",不扣配额 |
| AI_SERVICE_UNAVAILABLE | 503 | OpenAI不可用 | 提示"AI服务暂时不可用",不扣配额 |
| SERVICE_UNAVAILABLE | 503 | Supabase不可用 | 提示"服务暂时不可用" |
```

### 文档04: 技术规范

**§3.1 Token有效期**
```markdown
* Supabase签发JWT(access token 1h + refresh token 30d)
```

**§3.2 Cookie设置**
```typescript
set(name, value, options) { cookieStore.set(name, value, options) },
remove(name, options) { cookieStore.set(name, '', options) },
```

**§3.3 会话刷新**
```markdown
* 尝试获取session并自动刷新：await supabase.auth.getSession()
```

**§2.3 扫描件检测**
```typescript
export async function detectScannedPdf(buffer: Buffer): Promise<boolean> {
  const data = await pdf(buffer)
  const firstPages = Math.min(data.numpages, 3)
  const avgCharsPerPage = data.text.length / firstPages
  return avgCharsPerPage < 50
}
```

**§2.5 虚拟滚动依赖**
```json
{
  "dependencies": {
    "react-window": "^1.8.10"
  }
}
```

**§13.1 删除window.fetch覆盖**
```markdown
**注**: 使用TanStack Query的全局配置添加client version header,避免覆盖window.fetch
```

**§13.1 删除middleware日志**
```markdown
**注**: 请求日志应在Route Handler中记录,middleware运行在Edge Runtime不支持数据库连接
```

**§7.3 localStorage清理**
```typescript
  } finally {
    // 清理所有本地数据(包括非token的UI偏好等)
    localStorage.clear()
    sessionStorage.clear()
```

**§10.3 Streaming配额**
```markdown
**配额处理规则**：Streaming已返回首token→配额已扣除;连接断开但未返回首token→配额未扣除
```

**§13.1 OpenAI usage**
```typescript
    // 注意: streaming模式下usage在final chunk中返回,需累积或等待stream结束
    const response = await openai.chat.completions.create({
```

---

## 文档使用指南

### 原文档 vs 冻结版本

| 文档 | 原版本 | 冻结版本 | 状态 |
|------|--------|---------|------|
| PRD | `01_light_prd.md` | `01_light_prd_FROZEN.md` | ✅ 已创建 |
| 页面流程 | `02_page_and_flow_design.md` | 见修改摘要 | 📝 参考本文档 |
| API设计 | `03_api_design.md` | 见修改摘要 | 📝 参考本文档 |
| 技术规范 | `04_tech_and_code_style.md` | 见修改摘要 | 📝 参考本文档 |

### 实施建议

1. **立即修正**（P0）：
   - Token有效期（影响会话管理）
   - Cookie API签名（影响认证）
   - Streaming配额扣除（影响计费）
   - 边界情况处理（影响稳定性）

2. **短期补充**（P1）：
   - 统一错误码清单
   - 缓存行为定义
   - 虚拟滚动依赖

3. **长期优化**（P2）：
   - 幂等机制（需Redis）
   - 限流实现（需Redis）
   - 定时任务（需Cron Job）

---

**版本状态**: ✅ 冻结
**最后更新**: 2026-01-04
**审计轮次**: 4轮（事实错误、不一致性、边界情况、定义来源）
**总修改数**: 39处
