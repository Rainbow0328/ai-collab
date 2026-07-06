# AI Collab 前端项目修复方案 - 方案3：纯 CSS

## 一、已完成的工作

### 1. 移除 Tailwind 依赖 ✅
- 卸载了 `tailwindcss`、`@tailwindcss/vite`、`tailwind-merge`
- 删除了 `tailwind.config.js` 配置文件
- 更新了 `vite.config.ts`，移除 Tailwind 插件
- 更新了 `utils.ts`，移除 `tailwind-merge`

### 2. 重新设计 CSS 变量系统 ✅
- 保留了完整的 CSS 变量定义
- 支持深色/浅色主题切换
- 定义了字体、颜色、阴影、圆角等设计 token

### 3. 创建组件样式类 ✅
- `.btn-primary` - 主要按钮样式
- `.btn-secondary` - 次要按钮样式
- `.btn-danger` - 危险按钮样式
- `.card` - 卡片样式
- `.input` - 输入框样式
- `.badge` - 徽章样式
- `.modal-backdrop` - 模态框背景
- `.modal-content` - 模态框内容

### 4. 添加动画关键帧 ✅
- `fadeIn` - 淡入
- `fadeInUp` - 从下方淡入
- `fadeInDown` - 从上方淡入
- `fadeInLeft` - 从左侧淡入
- `fadeInRight` - 从右侧淡入
- `scaleIn` - 缩放进入
- `slideInUp` - 从下方滑入
- `slideInDown` - 从上方滑入
- `pulse` - 脉冲
- `spin` - 旋转
- `ping` - 弹跳
- `bounce` - 跳动
- `skeleton-pulse` - 骨架屏脉冲
- `skeleton-wave` - 骨架屏波浪

### 5. 添加动画工具类 ✅
- `.animate-fade-in` - 淡入动画
- `.animate-fade-in-up` - 从下方淡入
- `.animate-fade-in-down` - 从上方淡入
- `.animate-fade-in-left` - 从左侧淡入
- `.animate-fade-in-right` - 从右侧淡入
- `.animate-scale-in` - 缩放进入
- `.animate-slide-in-up` - 从下方滑入
- `.animate-slide-in-down` - 从上方滑入
- `.animate-pulse` - 脉冲动画
- `.animate-spin` - 旋转动画
- `.animate-ping` - 弹跳动画
- `.animate-bounce` - 跳动动画
- `.animate-skeleton` - 骨架屏动画
- `.animate-stagger-1` 到 `.animate-stagger-5` - 交错动画延迟

---

## 二、待完成的工作

### 1. 更新页面组件（128 处）
需要将所有 Tailwind 类名转换为纯 CSS 类名或内联样式。

**主要类名转换**：
- `flex` → `display: flex`
- `gap-2` → `gap: 0.5rem`
- `p-6` → `padding: 1.5rem`
- `m-4` → `margin: 1rem`
- `text-2xl` → `font-size: 1.5rem`
- `bg-surface` → `background-color: var(--color-surface)`
- `border-border` → `border: 1px solid var(--color-border)`
- `rounded-lg` → `border-radius: var(--radius-lg)`

### 2. 更新组件库
需要更新所有组件，移除 Tailwind 类名，使用纯 CSS 类名。

**需要更新的组件**：
- Button
- Card
- Input
- Select
- Badge
- Modal
- Skeleton
- Tabs
- DataTable
- PageTransition
- AnimatedList

### 3. 测试验证
需要测试所有页面和组件，确保样式正确。

---

## 三、技术方案

### 方案：纯 CSS + CSS 变量

**优点**：
- 完全可控
- 不依赖第三方库
- 性能最好
- 易于维护

**实现方式**：
1. 使用 CSS 变量定义设计 token
2. 创建组件样式类
3. 使用内联样式补充
4. 不使用任何 Tailwind 类名

---

## 四、下一步行动

### 立即行动（高优先级）
1. 更新页面组件（128 处）
2. 更新组件库
3. 测试验证

### 短期行动（中优先级）
1. 优化 CSS 体积
2. 添加更多组件样式
3. 完善文档

### 长期行动（低优先级）
1. 性能优化
2. 用户体验提升
3. 功能完善

---

## 五、总结

**核心方案**：放弃 Tailwind，使用纯 CSS + CSS 变量

**已完成**：
- 移除 Tailwind 依赖
- 重新设计 CSS 变量系统
- 创建组件样式类
- 添加动画关键帧和工具类

**待完成**：
- 更新页面组件（128 处）
- 更新组件库
- 测试验证

**优先级**：
- 高优先级：更新页面组件和组件库
- 中优先级：优化 CSS 体积
- 低优先级：性能优化和用户体验提升
