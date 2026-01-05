# 文档冻结版本 - 修改清单

> 基于四轮审计的最终修改指令
> 执行完成后视为冻结版本

---

## 文档01: 01_light_prd.md

### 修改1: §3.1 配额说明 (L143-146)
**替换**: "MVP阶段不实施配额重置机制"
**改为**: "MVP阶段AI配额不重置,仅自动讲解每日00:00 UTC重置(需Cron Job实现,见04_TECH)"

### 修改2: §4.1 性能基线 (L186-189)
**删除**: 优化策略3条
**添加**: "**注**: 优化策略见04_TECH §10"

---

## 文档02: 02_page_and_flow_design.md

### 修改1: §5.2 自动讲解缓存 (L131)
**替换**: "首次生成存储到后端,重开文档优先从存量恢复,不重复调用AI"
**改为**: "缓存行为见03_API §3.3(按userId+fileId+page检查,已有则返回,不扣配额和限流)"

### 修改2: §9 新增边界情况
**在§9末尾添加**:
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

---

## 文档03: 03_api_design.md

### 修改1: §1.1 Token有效期 (L40)
**替换**: "refresh token 7d"
**改为**: "refresh token 30d"

### 修改2: §0 配额消耗原则 (L24)
**替换**: "同一请求(相同sessionId+参数)在1分钟内重试不扣除额外配额"
**改为**: "防滥用:相同(userId+endpoint+参数hash)在5秒内的重复请求返回409(需Redis实现,MVP可降级为无幂等)"

### 修改3: §3.3 自动讲解缓存 (L483)
**替换**: "若页面已有自动贴纸缓存,不重复调用,也不计数"
**改为**: "缓存检查:查询数据库是否已有(userId,fileId,page)的自动贴纸,有则直接返回,不重新生成,不扣配额和限流计数"

### 修改4: §6 新增统一错误码清单
**在文档末尾添加**:
```markdown
## 6. 统一错误码清单

| 错误码 | HTTP | 含义 | 前端行为 |
|--------|------|------|---------|
| UNAUTHORIZED | 401 | 未登录或token过期 | 清理状态+跳转/login |
| EMAIL_NOT_CONFIRMED | 403 | 邮箱未验证 | 显示"重发邮件"按钮 |
| QUOTA_EXCEEDED | 429 | 配额用尽 | 禁用按钮+显示剩余配额 |
| AUTO_EXPLAIN_LIMIT_REACHED | 429 | 自动讲解限流 | 仅禁用"Explain this page"按钮 |
| COURSE_LIMIT_REACHED | 403 | 课程数量达上限 | 禁用"新建课程"按钮 |
| DUPLICATE_COURSE_NAME | 409 | 课程名重复 | 提示修改名称 |
| FILE_NAME_CONFLICT | 409 | 文件名冲突 | 弹出对话框(重命名/替换/取消) |
| SUMMARY_IN_PROGRESS | 409 | 总结生成中 | 显示"正在生成"并禁用按钮 |
| AI_TIMEOUT | 504 | AI请求超时 | 提示"请求超时,请稍后重试",不扣配额 |
| AI_SERVICE_UNAVAILABLE | 503 | OpenAI不可用 | 提示"AI服务暂时不可用",不扣配额 |
| SERVICE_UNAVAILABLE | 503 | Supabase不可用 | 提示"服务暂时不可用" |
```

---

## 文档04: 04_tech_and_code_style.md

### 修改1: §3.1 Token有效期 (L98)
**替换**: "refresh token 7d"
**改为**: "refresh token 30d"

### 修改2: §3.2 Cookie设置方法 (L122-123)
**替换**: 
```typescript
set(name, value, options) { cookieStore.set({ name, value, ...options }) },
remove(name, options) { cookieStore.set({ name, value: '', ...options }) },
```
**改为**:
```typescript
set(name, value, options) { cookieStore.set(name, value, options) },
remove(name, options) { cookieStore.set(name, '', options) },
```

### 修改3: §3.3 会话刷新 (L133)
**替换**: "尝试获取用户并自动刷新session:await supabase.auth.getUser()"
**改为**: "尝试获取session并自动刷新:await supabase.auth.getSession()"

### 修改4: §2.3 扫描件检测 (L66-71)
**替换**: `pdf(buffer, { max: 3 })`
**改为**: 
```typescript
export async function detectScannedPdf(buffer: Buffer): Promise<boolean> {
  const data = await pdf(buffer)
  const firstPages = Math.min(data.numpages, 3)
  const avgCharsPerPage = data.text.length / firstPages
  return avgCharsPerPage < 50
}
```

### 修改5: §13.1 删除window.fetch覆盖 (L530-548)
**删除整段**: "前端发送client version"示例代码
**改为**: "**注**: 使用TanStack Query的全局配置添加client version header,避免覆盖window.fetch"

### 修改6: §13.1 删除middleware日志记录 (L875-900)
**删除**: middleware中的请求日志示例
**改为**: "**注**: 请求日志应在Route Handler中记录,middleware运行在Edge Runtime不支持数据库连接"

### 修改7: §2 添加虚拟滚动依赖
**在§2.3后添加**:
```markdown
### 2.5 虚拟滚动(大型PDF优化)

```json
{
  "dependencies": {
    "react-window": "^1.8.10"
  }
}
```

**用途**: 大型PDF(>50页)使用虚拟滚动,仅渲染可见页±2
```

### 修改8: §7.3 localStorage清理说明 (L286-287)
**在L285后添加注释**:
```typescript
  } finally {
    // 清理所有本地数据(包括非token的UI偏好等)
    localStorage.clear()
    sessionStorage.clear()
```

### 修改9: §10.3 Streaming配额扣除 (L436)
**替换**: "Streaming已开始(hasReceivedFirstToken === true)→配额已扣除"
**改为**: "Streaming已返回首token→配额已扣除;连接断开但未返回首token→配额未扣除"

### 修改10: §13.1 OpenAI usage字段 (L962-963)
**在L960后添加注释**:
```typescript
    // 注意: streaming模式下usage在final chunk中返回,需累积或等待stream结束
    const response = await openai.chat.completions.create({
```

---

## 修改执行顺序

1. 先修改03_API(定义权威来源)
2. 再修改04_TECH(修正技术错误)
3. 然后修改01_PRD(删除重复,添加引用)
4. 最后修改02_PAGE(删除重复,添加引用)

---

## 修改完成后的验证

- [ ] 所有token有效期统一为30天
- [ ] 所有配额定义引用01_PRD
- [ ] 所有数据模型引用03_API
- [ ] 删除了所有重复定义
- [ ] 补齐了P0级边界情况
- [ ] 修正了所有事实错误
- [ ] 文档总长度未增加

---

**状态**: 待执行
**执行后**: 文档进入冻结状态,不再接受功能性修改
