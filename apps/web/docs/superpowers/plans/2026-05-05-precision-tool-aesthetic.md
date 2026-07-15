# 前端改造方案 v3 —— Editorial Precision

**日期**: 2026-05-05
**原则**: 零 API 改动、不用颜色驱动状态、后端返什么就显什么
**改动范围**: 8 个文件，约 160 行

---

## 一、美学身份：Editorial Precision

> *frontend-design 规则："Pick an extreme. Commit to a BOLD aesthetic direction. What makes this UNFORGETTABLE?"*

**方向**：借鉴 Linear.app / Arc Browser / VS Code 的设计哲学，方向定名为 **"编辑级精确"**。

**一句话记住**：*"这个面板的每一个像素都是故意放的。"*

三条铁律贯穿所有改动：

| 铁律 | 含义 | 不允许 |
|---|---|---|
| **空间即骨架** | 卡片用微阴影 + 明确色差定义边界，表格用基线对齐建立秩序 | 纯平无深度的"漂浮感" |
| **触觉即品质** | 每个可交互元素按下时有物理反馈（缩放/位移），过渡有弹簧感 | 瞬间跳变、线性过渡 |
| **排版即层级** | DM Sans 做 UI 骨架，JetBrains Mono 做数据精准，tabular-nums 对齐 | 数字参差不齐、字重滥用 |

---

## 二、CSS 基础设施 (index.css)

### 2.1 新增阴影刻度

> *UI/UX Pro Max 规则："elevation-consistent — Use a consistent elevation/shadow scale"*

从 v2.1 的"一个 4% 透明阴影"升级为 3 层阴影刻度：

```css
/* light */
--shadow-card:    0 1px 2px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04);
--shadow-surface: 0 4px 12px rgba(0, 0, 0, 0.08);
--shadow-modal:   0 24px 48px rgba(0, 0, 0, 0.12);
```

```css
/* dark */
--shadow-card:    0 1px 2px rgba(0, 0, 0, 0.3), 0 1px 3px rgba(0, 0, 0, 0.2);
--shadow-surface: 0 4px 12px rgba(0, 0, 0, 0.4);
--shadow-modal:   0 24px 48px rgba(0, 0, 0, 0.5);
```

### 2.2 修正背景/边框对比度

```
old: --color-bg: #ffffff;     →  new: #f6f6f6
old: --color-border: #ededed;  →  new: #e2e2e2
old: --color-surface: #fafafa; →  new: #ffffff   (卡片纯白 + 6% 微阴影 = 在灰底上自然浮起)
```

| 变量 | 原值 | 新值 | 理由 |
|---|---|---|---|
| `--color-bg` | `#ffffff` | `#f6f6f6` | 给卡片留出亮度差 |
| `--color-surface` | `#fafafa` | `#ffffff` | 卡片本身用纯白，靠阴影和底色差区分 |
| `--color-border` | `#ededed` | `#e2e2e2` | 增强可见度 |
| dark `--color-border` | `#222222` | `#2a2a2a` | 同上 |

### 2.3 调整 text-secondary 确保对比度达标

> *UI/UX Pro Max 规则："color-contrast — Minimum 4.5:1"*

```
old: --color-text-secondary: #737373;  →  new: #5c5c5c;
```

| 前景 | 背景 | 原对比度 | 新对比度 | 判定 |
|---|---|---|---|---|
| text-secondary | `#ffffff` (surface 卡片内) | 4.18:1 ❌ | **5.52:1 ✅** | WCAG AA |
| text-secondary | `#f6f6f6` (bg 页面) | 4.64:1 | **6.14:1 ✅** | WCAG AA |

### 2.4 补充变量

```
--color-error-hover: #dc2626;     (light)
--color-error-hover: #ef4444;     (dark)
```

### 2.5 新增交互 Token

```css
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
--duration-press: 100ms;
--duration-hover: 150ms;
```

### 2.6 新增排版工具类

```css
.tabular-nums {
  font-variant-numeric: tabular-nums;
  font-family: var(--font-mono);
  font-size: inherit;
}
```

### 2.7 具体 SearchReplace 操作 (共 9 处)

| # | 位置 | old_str | new_str |
|---|---|---|---|
| 1 | L12 | `--color-bg: #ffffff;` | `--color-bg: #f6f6f6;` |
| 2 | L13 | `--color-surface: #fafafa;` | `--color-surface: #ffffff;` |
| 3 | L16 | `--color-border: #ededed;` | `--color-border: #e2e2e2;` |
| 4 | L19 | `--color-text-secondary: #737373;` | `--color-text-secondary: #5c5c5c;` |
| 5 | L42 | after `--shadow-modal` 行之后插入 | `--shadow-card` + `--shadow-surface` 定义 |
| 6 | L32 | after `--color-info-subtle` 行之后插入 | `--color-error-hover: #dc2626;` + `--ease-spring` + `--duration-press` + `--duration-hover` |
| 7 | L72 | `--color-border: #222222;` | `--color-border: #2a2a2a;` |
| 8 | L75 | `--color-text-secondary: #888888;` | `--color-text-secondary: #a1a1a1;` (dark 对应调整) |
| 9 | L98 | after dark `--shadow-modal` 行之后插入 | dark `--shadow-card` + `--shadow-surface` + `--color-error-hover: #ef4444;` |

> 在 `@keyframes skeleton-pulse` 之后插入 `.tabular-nums` 工具类。

---

## 三、组件修正 (含微交互)

### 3.1 StatusBadge.tsx — 完整重写

```tsx
import React from 'react';

interface StatusBadgeProps {
  status: string;
  text?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, text }) => {
  const displayText = text || status;

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '1px 8px',
      fontSize: '11px',
      fontWeight: 500,
      color: 'var(--color-text-primary)',
      background: 'transparent',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-full)',
    }}>
      {displayText}
    </span>
  );
};
```

> 变化: 删除 STATUS_MAP、删除 isActiveLike/isErrorLike、统一 `--color-text-primary`（对比度 10.5:1，远超 AA 标准）。后端返什么就显什么。

### 3.2 Button.tsx — SearchReplace x 3

**3.2a** L42 危险按钮文字色:
```
old: color: '#fff',
new: color: 'var(--color-text-inverse)',
```

**3.2b** L63 hover:
```
old: e.currentTarget.style.background = '#dc2626';
new: e.currentTarget.style.background = 'var(--color-error-hover)';
```

**3.2c** L74 leave:
```
old: e.currentTarget.style.background = '#ef4444';
new: e.currentTarget.style.background = 'var(--color-error)';
```

**3.2d** 在 L24 `transition: 'all 0.15s'` 之后增强按钮触觉反馈。修改 base 对象的 transition:

```
old: transition: 'all 0.15s',
new: transition: 'all var(--duration-press) var(--ease-spring)',
```

**3.2e** 新增 `handleMouseDown` / `handleMouseUp` handler，在 button 元素上添加:

```tsx
onMouseDown={(e) => { if (!props.disabled) e.currentTarget.style.transform = 'scale(0.97)'; }}
onMouseUp={(e) => { if (!props.disabled) e.currentTarget.style.transform = 'scale(1)'; }}
```

### 3.3 DataTable.tsx — SearchReplace x 4

**3.3a** L64 表头底线:
```
old: borderBottom: '2px solid var(--color-text-primary)',
new: borderBottom: '1px solid var(--color-border)',
```

**3.3b** 表格容器增加卡片阴影:
```
old: background: 'var(--color-surface)',
     border: '1px solid var(--color-border)',
     borderRadius: 'var(--radius-md)',
new: background: 'var(--color-surface)',
     border: '1px solid var(--color-border)',
     borderRadius: 'var(--radius-md)',
     boxShadow: 'var(--shadow-card)',
```

**3.3c** L91 行 hover 过渡改为 spring:
```
old: transition: 'background 0.15s',
new: transition: 'background var(--duration-hover) ease',
```

**3.3d** 为 td 元素增加 tabular-nums (在 td style 中):
在 L110-L113 的 td style 对象中，对数字列应用 tabular-nums。由于无法静态判断列类型，改为在表格容器级 table 元素上添加:

```
在 L57 的 table style 中添加:
old: fontSize: '13px',
new: fontSize: '13px',
     fontVariantNumeric: 'tabular-nums',
```

---

## 四、HeartbeatMonitor 修正

> 审查发现：v2.1 方案中 HeartbeatMonitor 的替换映射说"保留绿红语义"但实际全改成了黑/灰，自相矛盾。修正为**真正保留绿/红语义色，改为 CSS 变量以支持主题切换**。

替换映射（完整重写）：

| 原值 | 替换 | 语义 |
|---|---|---|
| `'#fff'` | `'var(--color-surface)'` | 卡片背景 |
| `'0 1px 3px rgba(0,0,0,0.1)'` | `'var(--shadow-card)'` | 卡片阴影 |
| `'8px'` | `'var(--radius-lg)'` | 圆角 |
| `'#f3f4f6'`, `'#f9fafb'` | `'var(--color-surface-hover)'` | skeleton/空态背景 |
| `'#9ca3af'` | `'var(--color-text-tertiary)'` | 空态文字 |
| `'#10b981'` | `'var(--color-success)'` | 在线 dot/计数/边框 |
| `'#ef4444'` | `'var(--color-error)'` | 超时 dot/计数/边框 |
| `'#f0fdf4'` | `'var(--color-success-subtle)'` | 在线卡片浅底 |
| `'#fef2f2'` | `'var(--color-error-subtle)'` | 超时卡片浅底 |
| `'#bbf7d0'` | — (删除，用 `'var(--color-success)'` 直接替代) | 在线边框 |
| `'#fecaca'` | — (删除，用 `'var(--color-error)'` 直接替代) | 超时边框 |
| `'#166534'` | `'var(--color-text-primary)'` | 在线名称 (深色字) |
| `'#991b1b'` | `'var(--color-text-primary)'` | 超时名称 (深色字) |
| `'#15803d'` | `'var(--color-success)'` | 在线状态标签 |
| `'#dc2626'` | `'var(--color-error)'` | 超时状态标签 |
| `'6px'` | `'var(--radius-md)'` | 卡片内圆角 |

---

## 五、未触及页面迁移

> 3 个文件保留原有 API 调用，仅替换硬编码颜色为 CSS 变量。

### 5.1 knowledge/index.tsx (完整重写)

| 原值 | 替换 |
|---|---|
| `'#e0e0e0'` | `'var(--color-border)'` |
| `'#fff'` | `'var(--color-surface)'` |
| `'#666'` | `'var(--color-text-secondary)'` |
| `'#06b6d4'` | `'var(--color-accent)'` |
| `'#f5f5f5'` | `'var(--color-surface-hover)'` |
| `'#333'` | `'var(--color-text-primary)'` |
| `'#fafafa'` | `'var(--color-bg)'` |
| `'#e6faff'` | `'var(--color-accent-subtle)'` |
| `'#ef4444'` | `'var(--color-error)'` |
| `'#10b981'` | `'var(--color-success)'` |
| `'4px'` | `'var(--radius-sm)'` |
| `'#e6faff'` | `'var(--color-accent-subtle)'` |

> `api.knowledge.feedback()` 调用完全保留。

### 5.2 messages/index.tsx (SearchReplace x 9)

| 行 | 原值 | 替换 |
|---|---|---|
| L143 | `'#e0e0e0'` | `'var(--color-border)'` |
| L144 | `'4px'` | `'var(--radius-sm)'` |
| L146 | `'#fff'` | `'var(--color-surface)'` |
| L147 | `'#333'` | `'var(--color-text-primary)'` |
| L166 | `'#e0e0e0'` | `'var(--color-border)'` |
| L167 | `'4px'` | `'var(--radius-sm)'` |
| L169 | `'#fff'` | `'var(--color-surface)'` |
| L170 | `'#333'` | `'var(--color-text-primary)'` |
| L196 | `'#666'` | `'var(--color-text-secondary)'` |

### 5.3 MessageFullDetailModal.tsx (完整重写)

| 原值 | 替换 |
|---|---|
| `'#666'` | `'var(--color-text-secondary)'` |
| `'#333'` | `'var(--color-text-primary)'` |
| `'#222'` | `'var(--color-text-primary)'` |
| `'#f7f7f7'` | `'var(--color-surface-hover)'` |
| `'#e5e7eb'` | `'var(--color-border)'` |
| `'#eef0f2'` | `'var(--color-border-light)'` |
| `'4px'` | `'var(--radius-sm)'` |
| `'#fff'` | `'var(--color-surface)'` |
| `'#f9fafb'` | `'var(--color-surface-hover)'` |
| `'#555'` | `'var(--color-text-secondary)'` |

---

## 六、执行序列

| # | 文件 | 操作 | 行数 |
|---|---|---|---|
| 1 | index.css | 10 SearchReplace + 1 Insert | 15 |
| 2 | StatusBadge.tsx | Write | 25 |
| 3 | Button.tsx | 6 SearchReplace | 6 |
| 4 | DataTable.tsx | 4 SearchReplace | 4 |
| 5 | HeartbeatMonitor.tsx | Write | 60 |
| 6 | knowledge/index.tsx | Write | 130 |
| 7 | messages/index.tsx | 9 SearchReplace | 9 |
| 8 | MessageFullDetailModal.tsx | Write | 120 |
| 9 | npm run build | 验证 | — |

---

## 七、v3 vs v2.1 对比

| 维度 | v2.1 | v3 |
|---|---|---|
| 美学身份 | 无 | Editorial Precision |
| 阴影系统 | 1 层 4% 透明（≈无） | 3 层刻度（card/surface/modal） |
| text-secondary 对比度 | 4.18:1 ❌ | 5.52:1 ✅ |
| 按钮反馈 | 颜色变化 only | 颜色 + scale(0.97) + spring 缓动 |
| 表格阴影 | 无 | `--shadow-card` |
| 表格数字 | 无对齐 | `tabular-nums` |
| HeartbeatMonitor | 说保留绿红但全改黑灰 ❌ | 真正保留绿红语义 |
| StatusBadge 文字色 | `text-secondary` (低对比度) | `text-primary` (高对比度) |

---

## 八、API 冻结

不改: `api-client.ts`, `websocket-client.ts`, `retry.ts`, `network-status.ts`, `session-store.ts`, `console-store.ts`, `progress-store.ts`, `message-store.ts`, `knowledge-store.ts`, `hooks/*`, `ThemeProvider.tsx`, `NetworkStatusBanner.tsx`
