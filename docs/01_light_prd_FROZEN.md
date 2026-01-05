# StudentAid Web - PRD（冻结版本）

> **文档定位**：产品需求基线,定义"做什么"和"为什么";技术实现见03/04文档。
> **版本状态**：✅ 冻结 - 基于审计修正的最终版本

---

## 一、产品定位

**目标用户**：理工科/商科大学生,整学期跟课学习 + 考前复习  
**核心价值**：以课程为单位管理PDF + AI逐页讲解 + 考点梳理  
**三大能力**：
1. 按课程组织Lecture/Homework/Exam/Other PDF
2. 同屏完成"阅读PDF + AI讲解(贴纸) + 追问"
3. 生成课程级考点清单

**两大场景**：
- **跟课学习**：每周课后结合讲义理解概念、完成作业，贴纸记录学习轨迹
- **考前复习**：快速生成文档/课程总结，梳理高频考点，定位已标记难点

---

## 二、功能模块

### 2.1 P5页面结构（核心学习页）

* **左侧**：PDF阅读器(分页/缩放/记忆lastReadPage)
* **右侧AI区**：
  * 上部：贴纸栏(自动讲解 + 选中讲解)
  * 下部：问答与总结区

### 2.2 四类AI能力

| 能力 | 触发方式 | 计费规则 |
|------|---------|---------|
| 自动讲解 | 点击"Explain this page" | 300次/账户/月(不计入其他配额) |
| 选中讲解 | 选中文本 → AI讲解 | 计入learningInteractions |
| 问答 | 问答区输入问题 | 计入learningInteractions |
| 总结 | 文档/章节/课程总结按钮 | 各计入独立配额桶 |

**PDF类型差异**：
* Lecture：概念讲解 + 公式直觉
* Homework/Exam：考点分析 + 思路提示(不直接给答案)

### 2.3 贴纸机制

**类型**：
* 自动贴纸(Auto)：系统按页生成2-6条,对齐原文位置
* 手动贴纸(Manual)：用户选中触发,支持追问链(最多3层深度)

**持久化**：
* 支持折叠/展开,状态持久化
* 单条贴纸最大高度300-400px,超出内部滚动
* 重开文档恢复所有贴纸及折叠状态

**数据模型**：见03_API §3.0.1

### 2.4 扫描件处理

* 上传时检测文本层可用性(检测算法见04_TECH §2.3)
* P5右侧提示"不支持AI讲解",隐藏AI入口
* 左侧PDF阅读器正常可用

### 2.5 统一富文本格式

所有AI输出统一为**Markdown文本**(格式规范见03_API §3.0.3)：
* 格式：标题/粗体/列表/表格/引用
* 公式：行内`$...$`,块级`$$...$$`(KaTeX渲染)
* 代码：三反引号+语言标记
* 约束：后端不返回HTML,前端统一用`MarkdownRenderer`

### 2.6 数据收集规范

#### 必须收集（MVP核心）
1. **账户身份**: user_id, email, created_at, email_confirmed_at, last_login_at
2. **课程结构**: course_id, name, school, term, created_at, last_visited_at
3. **PDF元数据**: file_id, name, type, page_count, is_scanned, uploaded_at, last_read_page
4. **AI学习数据**: 贴纸（完整模型见03_API §3.0.1）、问答/总结结果
5. **配额数据**: bucket, used, limit, reset_at（防滥用、成本控制）

#### 建议收集（可选）
6. **轻量行为**: has_used_auto_explain, has_used_manual_explain, has_generated_summary（仅boolean，判断功能是否被使用）
7. **PDF去重**: pdf_content_hash（SHA-256，成本优化，详见04_TECH §13.2）
8. **设备与客户端状态**（安全、兼容性、排错）:
   - `user_agent`（或解析后的browserName, browserVersion）
   - `device_type`（desktop/tablet，用于兼容性测试）
   - `locale`, `timezone`（用户本地化显示，如配额重置倒计时）
   - `client_version`（前端构建版本，用于排错回滚）
   - **不用于**: 广告追踪、设备指纹、用户画像
9. **安全与审计数据**（账号安全、风控、事故追溯，短期留存）:
   - **登录审计**: userId, eventType（login_success/login_failed/logout/password_reset等）, createdAt, ipPrefix（/24或hash，不存完整IP）, requestId
   - **会话安全信号**: last_login_at, failed_login_count, is_rate_limited, risk_flags
   - **用途**: 检测异常登录、防暴力破解、事故追溯
   - **留存期**: 建议30-90天，不长期保存
10. **运行监控与成本核算**（稳定性、成本控制、限流优化，与隐私低耦合）:
    - **请求级指标**: requestId, userId, endpoint, statusCode, latencyMs, errorCode
    - **AI调用指标**: model, inputTokens, outputTokens, costUsdApprox（或内部计量单位）
    - **客户端性能**: PDF首屏LCP, TTFB（聚合上报，详见04_TECH §13.1）
    - **用途**: 成本核算、性能优化、限流调整、故障排查
    - **隐私**: 不包含用户内容，仅技术指标
11. **用户反馈**（产品改进、问题定位）:
    - **反馈内容**: userId, courseId/fileId/page（可选定位）, message, includeDiagnostics（是否附带requestId、错误码等运行信息）
    - **用途**: 收集用户建议、快速定位问题、改进产品
    - **隐私**: 用户主动提交，可选择是否包含诊断信息
12. **计费与权限预留**（未来扩展，MVP阶段预留字段）:
    - **计划类型**: plan（free/trial/pro）
    - **配额覆盖**: quotaOverrides（JSON，可为特定用户调整配额）
    - **计费集成**: billingCustomerId（未来对接Stripe等）
    - **功能开关**: entitlements（是否启用自动讲解、课程级提纲等）
    - **说明**: MVP阶段所有用户默认free计划，预留字段便于未来升级

#### 不收集（明确禁止）
- ❌ 真实姓名、手机号、身份证、学号、专业、年级
- ❌ 完整IP地址、地理位置、设备指纹
- ❌ 详细行为时间线（点击流、停留时长、光标轨迹）
- ❌ 第三方追踪（Google Analytics、Mixpanel等）

#### 数据收集原则
* ✅ 最小化：只收集功能必需的数据
* ✅ 透明化：所有数据都是用户主动操作产生
* ✅ 可控化：删除课程/文件时级联删除相关数据
* ✅ 隐私承诺：不用于广告、不做用户画像、不出售数据

---

## 三、配额与限流策略

### 3.1 配额粒度设计

**原则**：按账户全局配额,所有课程共享

| 类型 | 粒度 | 默认值 |
|------|------|--------|
| 课程数量 | (userId) | 6门 |
| AI配额 | (userId) | 见下表 |

**AI配额桶**(按账户全局)：

| 配额桶 | 包含操作 | 限制 |
|--------|---------|------|
| learningInteractions | 选中讲解 + 问答 | 150次/月 |
| documentSummary | 文档总结 | 100次/月 |
| sectionSummary | 章节总结 | 65次/月 |
| courseSummary | 课程级提纲 | 15次/月 |
| autoExplain | 自动讲解 | 300次/月 |

**配额说明**：
* 所有课程共享上述配额,不按课程单独计数
* 删除课程不影响配额(配额属于账户而非课程)
* 所有配额每月1号00:00 UTC自动重置(需Cron Job实现,见04_TECH §13.1)

### 3.2 配额重置机制

**重置规则**：

| 配额类型 | 重置周期 | 重置时间 |
|---------|---------|----------|
| 所有AI配额 | 每月 | 每月1号00:00 UTC |

**触达行为**：
* 返回HTTP 429 + 对应错误码(见03_API §6)
* 前端提示："本月配额已用尽(X/Y),将于下月1号重置。"

### 3.3 前端提示规则

**接近上限**(>90%)：
* P4课程详情页顶部黄色警告
* P5按钮旁轻量提示："You're close to the limit..."

**触达上限**：
* 按钮置灰,hover显示tooltip
* 提供"View quota details"链接跳转P7
* 仍可浏览PDF和已有贴纸/总结

---

## 四、非功能需求

### 4.1 性能基线

**测试环境**：Chrome 120+ / Fast 3G / 4x CPU throttling / 中型PDF(20-50页,2-5MB)

| 指标 | 目标值(P75) |
|------|------------|
| PDF首屏加载(LCP) | <3s |
| 翻页响应 | <100ms(P90) |
| AI首token延迟(TTFB) | <5s |
| AI完整响应 | <15s(P90) |

**注**: 优化策略见04_TECH §10

### 4.2 技术选型(固定)

* **BaaS**：Supabase(Auth+Postgres+Storage),仅server-side使用
* **LLM**：OpenAI API,仅server-side调用
* **前端**：Next.js App Router + TypeScript + Tailwind + TanStack Query

---

## 五、验收标准(核心)

### 5.1 功能完整性

- [ ] 注册/登录/登出流程可跑通(含邮箱验证)
- [ ] 创建课程、上传PDF、在P4查看资料
- [ ] 在P5完成：自动讲解、选中讲解、追问链、问答、总结
- [ ] 扫描件PDF显示说明,AI功能禁用

### 5.2 配额控制有效性

**按账户全局**：
- [ ] 所有课程共享配额,在Calculus I用掉100次learningInteractions后,剩余50次可用于任何课程
- [ ] P4显示账户全局剩余配额
- [ ] P7显示账户级配额使用情况

**触顶行为**：
- [ ] API返回HTTP 429 + 对应错误码
- [ ] 前端禁用按钮并显示提示
- [ ] 配额每月重置,本月用尽下月1号自动恢复

### 5.3 性能达标

- [ ] 中型PDF首屏加载P75 ≤ 3秒(Lighthouse验收)
- [ ] AI响应P75 ≤ 5秒返回首token或loading反馈

---

## 六、范围外(MVP不做)

* 多人协作/分享课程
* 移动端专门适配
* 题库与刷题功能
* 用户编辑贴纸内容或添加个人备注
* 复杂学习路径推荐
* 贴纸删除功能(仅支持折叠)
