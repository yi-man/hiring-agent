# 将 shadcn/ui 替换为 HeroUI (@heroui/react) 的设计文档

## 概述

本设计文档详细描述了将项目中的 shadcn/ui 组件库替换为 HeroUI (@heroui/react) 官方 npm 包的实施方案。

## 项目背景

当前项目使用 shadcn/ui 作为 UI 组件库，但 shadcn/ui 的原子化设计风格在某些场景下过于复杂。HeroUI 提供了更完整、更易用的组件设计，同时保持了现代化的外观。

## 目标

- 完全替换 shadcn/ui 组件
- 保留项目的整体架构和功能
- 删除所有 shadcn/ui 的关联代码
- 集成 HeroUI 官方 npm 包
- 保持深色/浅色主题切换功能
- 保持响应式设计

## 实施策略

### 1. 依赖更新

#### 要删除的依赖

- 所有 @radix-ui 相关依赖
- class-variance-authority
- tailwindcss-animate
- 其他 shadcn/ui 相关工具库

#### 要添加的依赖

- @heroui/react
- 可能需要更新的工具库

### 2. 组件替换

#### 组件映射

| shadcn/ui 组件 | HeroUI 组件 |
| -------------- | ----------- |
| Button         | Button      |
| Card           | Card        |
| Dialog         | Modal       |
| Tabs           | Tabs        |
| Input          | Input       |
| Textarea       | Textarea    |
| Checkbox       | Checkbox    |
| Radio Group    | Radio       |
| Switch         | Switch      |
| Label          | Label       |
| Separator      | Divider     |
| Badge          | Chip        |

### 3. 目录结构调整

```
src/
├── components/
│   ├── ui/                      # 新的 HeroUI 组件目录
│   ├── navbar.tsx               # 导航栏组件
│   └── theme-provider.tsx       # 主题提供商
```

### 4. 样式调整

- 更新 Tailwind 配置以支持 HeroUI
- 更新全局样式以匹配 HeroUI 的设计风格
- 调整主题切换系统以兼容 HeroUI

### 5. 测试更新

- 更新所有组件的测试文件
- 确保所有功能测试通过
- 更新 E2E 测试以适应新组件

## 实施步骤

1. 备份当前代码
2. 安装 HeroUI 依赖
3. 删除 shadcn/ui 依赖
4. 创建 HeroUI 组件目录结构
5. 逐个替换组件
6. 调整样式和主题系统
7. 更新测试文件
8. 测试并验证功能
9. 修复发现的问题

## 风险评估

### 低风险

1. 依赖更新 - 有明确的替代方案
2. 样式调整 - 有完整的设计参考

### 中风险

1. 组件 API 差异 - 需要逐个调整
2. 测试更新 - 需要重写大部分测试

### 高风险

1. 功能兼容性 - 可能存在边缘情况

## 成功标准

- 所有组件替换完成
- 所有测试通过
- 项目能够正常构建和运行
- 所有功能正常工作
- 视觉设计符合 HeroUI 风格

## 后续维护

- 遵循 HeroUI 的更新策略
- 保持与官方版本的兼容性
- 定期更新依赖

## 替代方案

### 方案 2：使用 HeroUI 风格组件

保留当前组件结构，仅修改样式以匹配 HeroUI 的设计风格。

**优点**：

- 最小的代码改动
- 保留项目架构稳定
- 更容易维护

**缺点**：

- 不是完全的 HeroUI
- 需要手动调整样式

### 方案 3：完全重构

完全重构项目以使用 HeroUI 的架构。

**优点**：

- 完全符合 HeroUI 标准
- 最新的架构设计

**缺点**：

- 需要大量时间和资源
- 风险最高
