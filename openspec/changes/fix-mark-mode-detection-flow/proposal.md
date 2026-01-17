# Change: Fix Mark Mode Detection Flow

## Why

Mark mode 的当前实现流程有误。Mark mode 的核心功能是让用户快速将漏检的图片添加到 `detected_images` 数据库中。

**当前错误流程**：
1. 用户进入 mark mode
2. 点击页面任何位置 → 直接显示"手动绘制"弹窗

**正确流程应该是**：
1. 用户进入 mark mode
2. 点击漏检的图片区域 → 系统调用现有图片提取算法检测该位置的图片边界
3. 检测成功 → 直接保存到 `detected_images` 表
4. 检测失败 → 显示"手动绘制"弹窗
5. 用户手动绘制矩形 → 触发 AI 解释
6. 解释成功后 → 保存到 `detected_images` 表

## What Changes

- **NEW**: 点击位置图片检测 API - 在用户点击位置调用现有图片提取算法检测图片边界
- **MODIFIED**: Mark mode 点击处理逻辑 - 先尝试检测再决定是否显示弹窗
- **MODIFIED**: 检测成功后直接保存到 `detected_images`，无需 AI 解释

## Impact

- **Affected specs**: `pdf-viewer-interaction`
- **Affected code**:
  - `src/app/api/courses/[courseId]/files/[fileId]/images/detect/route.ts` - 新增：点击位置检测 API
  - `src/features/reader/components/pdf-viewer.tsx` - 修改：handlePageAreaClick 逻辑
  - `src/features/reader/hooks/use-image-detection.ts` - 新增：detectImageAtPosition 函数
  - `src/lib/pdf/image-extractor.ts` - 复用：现有图片提取算法

## Non-Goals (This Iteration)

- 修改现有图片提取算法
- 新增机器学习图像检测
- 修改手动绘制后的 AI 解释流程
