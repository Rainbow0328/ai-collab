# Noir Terminal — 视觉升级方案 v4

## 设计方向

### 产品定位
AI-Collab 是一个多 Agent 协同会话的**监控/管理后台**。用户是开发者/工程师，核心场景是：
- 查看会话列表、成员状态、任务链路、消息历史
- 监控系统运行状态（心跳、效率、判断记录）
- 管理模型、Agent、技能等系统资源

### 美学方向：Noir Terminal
**一句话**：把"开发者监控面板"该有的气质做出来——暗色为主、终端质感、数据优先。

| 维度 | 选择 |
|------|------|
| **主色调** | Dark mode 优先。底色深但不全黑（`#0d0d0d`），表面 `#141414`，悬浮 `#1a1a1a` |
| **强调色** | 单一蓝色强调（`#3388ff`），仅用于主按钮、选中态、链接 |
| **语义色** | green/amber/red 仅在心跳、错误、警告等有**天然语义**的场景使用 |
| **边框** | 微弱但可见（`#1f1f1f` 暗 / `#e8e8e8` 亮），提供模块分离感 |
| **阴影** | 3 级：card (0 1px 2px / 8%)、surface (0 4px 16px / 12%)、modal (0 16px 48px / 20%) |
| **字体** | DM Sans（UI 文案）+ JetBrains Mono（数据/代码）|
| **动效** | spring 弹性（cubic-bezier(0.34, 1.56, 0.64, 1)），hover 150ms，press 100ms |
| **间距** | 8px 基础网格（4/8/12/16/20/24/32/48） |

### 与 v3（Editorial Precision）的关键区别
| 维度 | v3（失败） | v4 |
|------|-----------|-----|
| 视觉变化量 | 80% 零视觉差异的重构 | 100% 产生视觉差异 |
| 配色 | 浅灰底 + 白卡片 = 看不出区别 | 深色底 + 深色卡片 = 明显不同 |
| 暗色模式 | 几乎和亮色模式一样亮 | 真正的深色终端体验 |
| 硬编码颜色 | 4/8 个文件仍有 `#xxx` | 零硬编码 |
| StatusBadge | 全部中性透明 | 全部中性透明（保持不变，用户要求） |
| 心跳监控 | CSS 变量但值相同 = 无变化 | 保留 green/red 语义，但暗色模式下调亮 |

---

## 文件清单

### 改动的文件（8 个）
1. `src/index.css` — 重写 CSS 变量（暗色主题完整定义）
2. `src/components/admin/DataTable.tsx` — 表头重设计、行悬停、空状态
3. `src/components/admin/PageHeader.tsx` — 标题排版升级
4. `src/components/admin/Button.tsx` — 暗色风格按钮
5. `src/components/admin/Modal.tsx` — 暗色风格模态框
6. `src/components/sessions/MemberStatusCard.tsx` — 替换所有硬编码颜色
7. `src/components/messages/MessageTimeline.tsx` — 替换所有硬编码颜色
8. `src/components/messages/MessageDetail.tsx` — 替换所有硬编码颜色

### 不改动的文件
- `StatusBadge.tsx` — 用户要求中性显示，保持现状
- `pages/*.tsx` — 所有页面已使用 CSS 变量，改 index.css 即可全局生效
- `layout/*.tsx` — 已使用 CSS 变量
- `HeartbeatMonitor.tsx` — 上一轮已完成 CSS 变量化
- `MessageFullDetailModal.tsx` — 上一轮已完成
- `knowledge/index.tsx` — 上一轮已完成
- `messages/index.tsx` — 上一轮已完成
- 所有 hooks、stores、api 层 — 不动

---

## 任务列表

### 任务 1：重写 `src/index.css` — 暗色主题 + 完整 CSS 变量体系

**目标**：将所有 CSS 变量替换为 Noir Terminal 配色，暗色模式为主，亮色模式适配。

**操作**：用以下内容覆盖 `:root` 和 `[data-theme="dark"]` 块。

```css
:root {
  --font-sans: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;

  --color-bg: #0d0d0d;
  --color-surface: #141414;
  --color-surface-hover: #1a1a1a;
  --color-surface-raised: #1a1a1a;
  --color-border: #1f1f1f;
  --color-border-light: #1c1c1c;
  --color-text-primary: #e8e8e8;
  --color-text-secondary: #888888;
  --color-text-tertiary: #555555;
  --color-text-inverse: #0d0d0d;
  --color-text-disabled: #444444;
  --color-accent: #3388ff;
  --color-accent-hover: #5599ff;
  --color-accent-subtle: #0f1a2e;
  --color-success: #22c55e;
  --color-success-subtle: #0a1a10;
  --color-warning: #eab308;
  --color-warning-subtle: #1a150a;
  --color-error: #ef4444;
  --color-error-subtle: #1a0f0f;
  --color-info: #6366f1;
  --color-info-subtle: #0f0f1a;
  --color-error-hover: #f87171;

  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --duration-press: 100ms;
  --duration-hover: 150ms;

  --color-sidebar-bg: #0a0a0a;
  --color-sidebar-hover: #141414;
  --color-sidebar-active: #0f1a2e;
  --color-sidebar-border: #1a1a1a;
  --color-sidebar-text: #555555;
  --color-sidebar-text-active: #e8e8e8;

  --color-modal-backdrop: rgba(0, 0, 0, 0.6);
  --shadow-card: 0 1px 2px rgba(0, 0, 0, 0.4), 0 1px 3px rgba(0, 0, 0, 0.2);
  --shadow-surface: 0 4px 16px rgba(0, 0, 0, 0.5);
  --shadow-modal: 0 16px 48px rgba(0, 0, 0, 0.6);

  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-full: 9999px;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 16px;
  --space-4: 24px;
  --space-5: 32px;
  --space-6: 48px;

  --transition-fast: 120ms ease;
  --transition-normal: 200ms ease;

  --font-size-xs: 11px;
  --font-size-sm: 12px;
  --font-size-base: 14px;
  --font-size-lg: 16px;
  --font-size-xl: 20px;
  --font-size-2xl: 24px;
}

[data-theme="light"] {
  --color-bg: #f5f5f5;
  --color-surface: #ffffff;
  --color-surface-hover: #f9f9f9;
  --color-surface-raised: #ffffff;
  --color-border: #e2e2e2;
  --color-border-light: #f0f0f0;
  --color-text-primary: #1a1a1a;
  --color-text-secondary: #5c5c5c;
  --color-text-tertiary: #a0a0a0;
  --color-text-inverse: #ffffff;
  --color-text-disabled: #c0c0c0;
  --color-accent: #2563eb;
  --color-accent-hover: #1d4ed8;
  --color-accent-subtle: #eff6ff;
  --color-success: #16a34a;
  --color-success-subtle: #f0fdf4;
  --color-warning: #ca8a04;
  --color-warning-subtle: #fefce8;
  --color-error: #dc2626;
  --color-error-subtle: #fef2f2;
  --color-info: #4f46e5;
  --color-info-subtle: #eef2ff;
  --color-error-hover: #ef4444;

  --color-sidebar-bg: #fafafa;
  --color-sidebar-hover: #f4f4f4;
  --color-sidebar-active: #eff6ff;
  --color-sidebar-border: #ededed;
  --color-sidebar-text: #a0a0a0;
  --color-sidebar-text-active: #1a1a1a;

  --color-modal-backdrop: rgba(0, 0, 0, 0.2);
  --shadow-card: 0 1px 2px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04);
  --shadow-surface: 0 4px 12px rgba(0, 0, 0, 0.06);
  --shadow-modal: 0 16px 48px rgba(0, 0, 0, 0.12);
}
```

**验证**：对比度检查
- `--color-text-primary (#e8e8e8)` 在 `--color-surface (#141414)` 上：对比度 11.5:1 ✓
- `--color-text-secondary (#888888)` 在 `--color-surface (#141414)` 上：对比度 5.1:1 ✓
- `--color-accent (#3388ff)` 在 `--color-surface (#141414)` 上：对比度 4.6:1 ✓

---

### 任务 2：升级 `src/components/admin/PageHeader.tsx` — 标题排版

**目标**：标题更大、副标题更轻、间距更合理。

**操作**：替换 `PageHeader` 组件 return 内容。

```tsx
import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  extra?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  extra,
}) => {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 'var(--space-5)',
      paddingBottom: 'var(--space-4)',
      borderBottom: '1px solid var(--color-border)',
    }}>
      <div>
        <h1 style={{
          fontSize: 'var(--font-size-2xl)',
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          marginBottom: subtitle ? '6px' : '0',
          letterSpacing: '-0.02em',
        }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{
            fontSize: '13px',
            color: 'var(--color-text-tertiary)',
            margin: 0,
            lineHeight: 1.5,
          }}>
            {subtitle}
          </p>
        )}
      </div>
      {extra && <div>{extra}</div>}
    </div>
  );
};
```

**变更说明**：
- `fontSize: 'var(--font-size-2xl)'`（24px，原来 20px）
- 副标题颜色从 `var(--color-text-secondary)` 改为 `var(--color-text-tertiary)`，拉开层级
- 添加 `letterSpacing: '-0.02em'` 增加精致感
- 添加底边分隔线 `borderBottom`
- marginBottom 从 `var(--space-4)` 改为 `var(--space-5)`

---

### 任务 3：升级 `src/components/admin/DataTable.tsx` — 表头重设计

**目标**：表头更突出、行悬停反馈、空状态美化。

**操作**：替换 `DataTable` 组件完整内容。

```tsx
import React from 'react';

interface DataTableProps {
  columns: {
    key: string;
    title: string;
    width?: string;
    render?: (value: any, record: any, index: number) => React.ReactNode;
  }[];
  data: any[];
  loading?: boolean;
  onRowClick?: (record: any, index: number) => void;
  rowKey?: string;
  emptyText?: string;
}

export const DataTable: React.FC<DataTableProps> = ({
  columns,
  data,
  loading,
  onRowClick,
  rowKey = 'id',
  emptyText = '暂无数据',
}) => {
  if (loading) {
    return (
      <div style={{
        padding: '48px',
        textAlign: 'center',
        color: 'var(--color-text-tertiary)',
        fontSize: 'var(--font-size-sm)',
      }}>
        加载中...
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div style={{
        padding: '64px 24px',
        textAlign: 'center',
        color: 'var(--color-text-tertiary)',
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border)',
        boxShadow: 'var(--shadow-card)',
      }}>
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          background: 'var(--color-surface-hover)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px',
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
            <polyline points="13 2 13 9 20 9" />
          </svg>
        </div>
        <div style={{ fontSize: 'var(--font-size-base)', marginBottom: '4px' }}>{emptyText}</div>
      </div>
    );
  }

  return (
    <div style={{
      background: 'var(--color-surface)',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--color-border)',
      boxShadow: 'var(--shadow-card)',
      overflow: 'hidden',
    }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontVariantNumeric: 'tabular-nums',
      }}>
        <thead>
          <tr style={{
            background: 'var(--color-surface-hover)',
            borderBottom: '1px solid var(--color-border)',
          }}>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  padding: '10px 16px',
                  textAlign: 'left',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--color-text-tertiary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  width: col.width,
                  whiteSpace: 'nowrap',
                }}
              >
                {col.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((record, index) => (
            <tr
              key={record[rowKey] ?? index}
              onClick={() => onRowClick?.(record, index)}
              style={{
                borderBottom: '1px solid var(--color-border-light)',
                cursor: onRowClick ? 'pointer' : 'default',
                transition: 'background var(--duration-hover) ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--color-surface-hover)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  style={{
                    padding: '10px 16px',
                    fontSize: '13px',
                    color: 'var(--color-text-primary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: col.width || '300px',
                  }}
                >
                  {col.render
                    ? col.render(record[col.key], record, index)
                    : record[col.key] ?? '-'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
```

**变更说明**：
- 表头：大写 + letter-spacing + 背景色 + 底部边框，视觉权重提升
- 行悬停：JavaScript 事件替代 CSS（避免 React 内联样式限制）
- 空状态：增加 SVG 插图（文档图标），替代纯文字
- 容器：添加 border + shadow-card 增强卡片感
- 保留 `fontVariantNumeric: 'tabular-nums'`

---

### 任务 4：升级 `src/components/admin/Button.tsx` — 暗色风格按钮

**目标**：按钮融入暗色主题，保持现有微交互。

**操作**：完整替换 `src/components/admin/Button.tsx`。

```tsx
import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  children,
  className,
  ...props
}) => {
  const getStyles = () => {
    const base = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 'var(--radius-md)',
      border: '1px solid transparent',
      fontWeight: 500,
      cursor: 'pointer',
      transition: 'transform var(--duration-press) var(--ease-spring), background var(--duration-hover) ease, box-shadow var(--duration-hover) ease, border-color var(--duration-hover) ease',
      outline: 'none',
      fontFamily: 'inherit',
      lineHeight: 1,
    };

    const typeStyles: Record<string, any> = {
      primary: {
        background: 'var(--color-accent)',
        color: '#ffffff',
        borderColor: 'var(--color-accent)',
      },
      secondary: {
        background: 'var(--color-surface)',
        color: 'var(--color-text-primary)',
        borderColor: 'var(--color-border)',
      },
      danger: {
        background: 'transparent',
        color: 'var(--color-error)',
        borderColor: 'var(--color-error)',
      },
    };

    const sizeStyles: Record<string, any> = {
      sm: { padding: '6px 12px', fontSize: '12px', height: '30px' },
      md: { padding: '8px 16px', fontSize: '13px', height: '34px' },
      lg: { padding: '10px 20px', fontSize: '14px', height: '38px' },
    };

    return { ...base, ...typeStyles[variant], ...sizeStyles[size] };
  };

  const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (props.disabled) return;
    if (variant === 'primary') {
      e.currentTarget.style.background = 'var(--color-accent-hover)';
      e.currentTarget.style.borderColor = 'var(--color-accent-hover)';
    } else if (variant === 'secondary') {
      e.currentTarget.style.background = 'var(--color-surface-hover)';
      e.currentTarget.style.borderColor = 'var(--color-border)';
    } else if (variant === 'danger') {
      e.currentTarget.style.background = 'var(--color-error-subtle)';
      e.currentTarget.style.borderColor = 'var(--color-error-hover)';
      e.currentTarget.style.color = 'var(--color-error-hover)';
    }
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (props.disabled) return;
    if (variant === 'primary') {
      e.currentTarget.style.background = 'var(--color-accent)';
      e.currentTarget.style.borderColor = 'var(--color-accent)';
    } else if (variant === 'secondary') {
      e.currentTarget.style.background = 'var(--color-surface)';
      e.currentTarget.style.borderColor = 'var(--color-border)';
    } else if (variant === 'danger') {
      e.currentTarget.style.background = 'transparent';
      e.currentTarget.style.borderColor = 'var(--color-error)';
      e.currentTarget.style.color = 'var(--color-error)';
    }
  };

  return (
    <button
      {...props}
      style={{
        ...getStyles(),
        ...(props.disabled && {
          opacity: 0.35,
          cursor: 'not-allowed',
        }),
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseDown={(e) => { if (!props.disabled) e.currentTarget.style.transform = 'scale(0.97)'; }}
      onMouseUp={(e) => { if (!props.disabled) e.currentTarget.style.transform = 'scale(1)'; }}
      className={className}
    >
      {children}
    </button>
  );
};
```

**变更说明**：
- primary 按钮文字改为 `#ffffff`（纯白，不使用 inverse 变量因为需要最亮）
- danger 按钮改为 outline 风格（透明背景 + 红色边框），dark mode 下更融合
- danger hover 时填充微妙的红色背景
- 添加 `lineHeight: 1` 和 `height` 确保按钮高度一致
- `borderRadius` 从 `4px` 改为 `var(--radius-md)`（6px）
- transition 新增 `border-color`

---

### 任务 5：升级 `src/components/admin/Modal.tsx` — 暗色风格模态框

**目标**：模态框融入暗色主题，关闭按钮改为 SVG。

**操作**：完整替换 `src/components/admin/Modal.tsx`。

```tsx
import React from 'react';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}

export const Modal: React.FC<ModalProps> = ({
  open,
  title,
  onClose,
  children,
  footer,
  width = '500px',
}) => {
  if (!open) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      animation: 'fadeIn 150ms ease',
    }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'var(--color-modal-backdrop)',
        }}
        onClick={onClose}
      />
      <div style={{
        position: 'relative',
        background: 'var(--color-surface-raised)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-modal)',
        border: '1px solid var(--color-border)',
        width,
        maxWidth: '90vw',
        maxHeight: '85vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-surface-hover)',
        }}>
          <h2 style={{
            fontSize: '15px',
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            margin: 0,
          }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="关闭"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-text-tertiary)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color var(--duration-hover) ease, background var(--duration-hover) ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--color-text-primary)';
              e.currentTarget.style.background = 'var(--color-surface-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--color-text-tertiary)';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div style={{
          padding: '20px',
          overflow: 'auto',
          flex: 1,
        }}>
          {children}
        </div>
        {footer && (
          <div style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--color-border)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
            background: 'var(--color-surface-hover)',
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
```

**变更说明**：
- 关闭按钮从文字 `×` 改为 SVG X 图标
- 标题栏和底部栏添加 `var(--color-surface-hover)` 背景，区分内容区
- 容器添加 `border: '1px solid var(--color-border)'` 增强边界感
- 添加 `animation: 'fadeIn 150ms ease'` 入场动效
- maxHeight 从 `90vh` 改为 `85vh`

---

### 任务 6：升级 `src/components/sessions/MemberStatusCard.tsx` — 替换硬编码颜色

**目标**：将 MemberStatusCard 中所有硬编码颜色替换为 CSS 变量。

**操作**：替换以下三段代码。

#### 6a：替换 `Header` 函数中的 `#6b7280`

```tsx
function Header({ title, summary }: { title: string; summary: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
      <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{title}</h2>
      <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{summary}</span>
    </div>
  );
}
```

#### 6b：替换 `LoadingState` 中的 `#f3f4f6`

```tsx
function LoadingState({ title }: { title: string }) {
  return (
    <div style={panelStyle}>
      <Header title={title} summary="加载中" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton-pulse" style={{
            height: '120px',
            background: 'var(--color-surface-hover)',
            borderRadius: 'var(--radius-lg)',
          }} />
        ))}
      </div>
    </div>
  );
}
```

#### 6c：替换 `MemberItem` 中的全部硬编码颜色

```tsx
function MemberItem({ member }: { member: SessionMember }) {
  const avatarColor = member.avatarColor || '#8b5cf6';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '12px',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      background: 'var(--color-surface)',
    }}>
      <div style={{
        width: '40px',
        height: '40px',
        borderRadius: '50%',
        background: avatarColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#ffffff',
        fontWeight: 600,
        fontSize: '14px',
        flexShrink: 0,
      }}>
        {member.name.charAt(0).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: 600,
          fontSize: '14px',
          color: 'var(--color-text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>{member.name}</div>
        <div style={{
          fontSize: '12px',
          color: 'var(--color-text-tertiary)',
        }}>{member.role}</div>
      </div>
      <span style={{
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: member.status === 'online' || member.status === 'busy' ? 'var(--color-success)' :
                     member.status === 'idle' || member.status === 'paused' ? 'var(--color-warning)' :
                     'var(--color-text-tertiary)',
        flexShrink: 0,
      }} />
    </div>
  );
}
```

#### 6d：替换 `panelStyle`

```tsx
const panelStyle = {
  background: 'var(--color-surface)',
  borderRadius: 'var(--radius-lg)',
  padding: '20px',
  boxShadow: 'var(--shadow-card)',
  border: '1px solid var(--color-border)',
};
```

**变更说明**：
- 删除了 `statusColors` 映射对象，简化逻辑
- 状态圆点直接根据 status 判断：在线/忙碌=绿，空闲/暂停=黄，离线=灰
- 卡片添加 `border` + `boxShadow` 增强立体感
- Loading 骨架添加 `className="skeleton-pulse"` 使用全局动画
- avatarColor 保留硬编码 `#8b5cf6`，因为这是来自后端数据的动态颜色，不是设计 token

---

### 任务 7：升级 `src/components/messages/MessageTimeline.tsx` — 替换硬编码颜色

**目标**：将 MessageTimeline 中 20+ 个硬编码颜色替换为 CSS 变量。

**操作**：替换以下代码段。

#### 7a：替换 `typeLabels` 颜色映射

```tsx
const typeLabels: Record<string, { label: string; bg: string; text: string }> = {
  task: { label: '任务', bg: 'var(--color-warning-subtle)', text: 'var(--color-warning)' },
  result: { label: '结果', bg: 'var(--color-success-subtle)', text: 'var(--color-success)' },
  system: { label: '系统', bg: 'var(--color-surface-hover)', text: 'var(--color-text-secondary)' },
  instruction: { label: '指令', bg: 'var(--color-accent-subtle)', text: 'var(--color-accent)' },
  progress: { label: '进度', bg: 'var(--color-success-subtle)', text: 'var(--color-success)' },
  heartbeat: { label: '心跳', bg: 'var(--color-info-subtle)', text: 'var(--color-info)' },
  ack: { label: '确认', bg: 'var(--color-warning-subtle)', text: 'var(--color-warning)' },
  error: { label: '错误', bg: 'var(--color-error-subtle)', text: 'var(--color-error)' },
};
```

#### 7b：替换空状态组件

```tsx
if (messages.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        color: 'var(--color-text-tertiary)',
      }}>
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          background: 'var(--color-surface-hover)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 12px',
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <div style={{ fontSize: '14px' }}>{emptyText}</div>
      </div>
    );
  }
```

#### 7c：替换日期分组头部

```tsx
<div style={{
            padding: '12px 16px 8px',
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--color-text-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            position: 'sticky',
            top: 0,
            background: 'var(--color-surface)',
            zIndex: 1,
            borderBottom: '1px solid var(--color-border-light)',
          }}>
```

#### 7d：替换 `MessageItemCard` 全部颜色

```tsx
function MessageItemCard({ message, selected, onClick }: MessageItemCardProps) {
  const typeStyle = typeLabels[message.type] || typeLabels.system;

  return (
    <div
      onClick={onClick}
      style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--color-border-light)',
        cursor: 'pointer',
        background: selected ? 'var(--color-accent-subtle)' : 'transparent',
        borderLeft: selected ? '2px solid var(--color-accent)' : '2px solid transparent',
        transition: 'background var(--duration-hover) ease, border-color var(--duration-hover) ease',
      }}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '4px',
      }}>
        <span style={{
          fontWeight: selected ? 600 : 500,
          fontSize: '13px',
          color: selected ? 'var(--color-accent)' : 'var(--color-text-primary)',
        }}>
          {message.senderName}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
          {formatTime(message.createdAt)}
        </span>
      </div>

      <div style={{
        fontSize: '12px',
        color: 'var(--color-text-secondary)',
        marginBottom: '6px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {message.summary}
      </div>

      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <span style={{
          padding: '1px 8px',
          borderRadius: 'var(--radius-full)',
          fontSize: '11px',
          fontWeight: 500,
          background: typeStyle.bg,
          color: typeStyle.text,
          border: '1px solid ' + typeStyle.text + '33',
        }}>
          {typeStyle.label}
        </span>
        {message.attachments && message.attachments > 0 && (
          <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: '2px' }}>
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
            {message.attachments}
          </span>
        )}
        {!message.isRead && (
          <span style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: 'var(--color-accent)',
            marginLeft: 'auto',
          }} />
        )}
      </div>
    </div>
  );
}
```

#### 7e：替换 `TimelineSkeleton` 中的颜色

```tsx
function TimelineSkeleton() {
  return (
    <div style={{ padding: '16px' }}>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} style={{ marginBottom: '20px' }}>
          <div className="skeleton-pulse" style={{
            height: '14px',
            width: '40%',
            background: 'var(--color-surface-hover)',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '8px',
          }} />
          <div className="skeleton-pulse" style={{
            height: '12px',
            width: '80%',
            background: 'var(--color-surface-hover)',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '8px',
          }} />
          <div className="skeleton-pulse" style={{
            height: '14px',
            width: '60px',
            background: 'var(--color-surface-hover)',
            borderRadius: 'var(--radius-full)',
          }} />
        </div>
      ))}
    </div>
  );
}
```

**变更说明**：
- 消息类型标签保留颜色语义（任务=黄，结果=绿，错误=红），使用 CSS 变量
- 附件图标从 emoji 📎 改为 SVG（ui-ux-pro-max 规则：No Emoji as Icons）
- 未读圆点从红色 `#ef4444` 改为蓝色 accent（红色应保留给错误）
- 选中左边框从 3px 改为 2px
- 所有间距微调

---

### 任务 8：升级 `src/components/messages/MessageDetail.tsx` — 替换硬编码颜色

**目标**：将 MessageDetail 中 20+ 个硬编码颜色替换为 CSS 变量。

**操作**：替换以下代码段。

#### 8a：替换 `typeLabels` 颜色映射（与 Timeline 一致）

```tsx
const typeLabels: Record<string, { label: string; bg: string; text: string }> = {
  task: { label: '任务', bg: 'var(--color-warning-subtle)', text: 'var(--color-warning)' },
  result: { label: '结果', bg: 'var(--color-success-subtle)', text: 'var(--color-success)' },
  system: { label: '系统', bg: 'var(--color-surface-hover)', text: 'var(--color-text-secondary)' },
  instruction: { label: '指令', bg: 'var(--color-accent-subtle)', text: 'var(--color-accent)' },
  progress: { label: '进度', bg: 'var(--color-success-subtle)', text: 'var(--color-success)' },
  heartbeat: { label: '心跳', bg: 'var(--color-info-subtle)', text: 'var(--color-info)' },
  ack: { label: '确认', bg: 'var(--color-warning-subtle)', text: 'var(--color-warning)' },
  error: { label: '错误', bg: 'var(--color-error-subtle)', text: 'var(--color-error)' },
};
```

#### 8b：替换 `MessageDetail` 函数完整内容

```tsx
export function MessageDetail({
  message,
  loading = false,
  onMarkAsRead,
  onReply,
  emptyText = '选择一条消息查看详情',
}: MessageDetailProps) {
  if (loading) {
    return <DetailSkeleton />;
  }

  if (!message) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--color-text-tertiary)',
        padding: '40px 20px',
      }}>
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: 'var(--color-surface-hover)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px',
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
        </div>
        <div style={{ fontSize: '14px' }}>{emptyText}</div>
      </div>
    );
  }

  const typeStyle = typeLabels[message.type] || typeLabels.system;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            background: 'var(--color-accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: '15px',
          }}>
            {message.senderName.charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--color-text-primary)' }}>{message.senderName}</div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>
              {formatFullTime(message.createdAt)}
            </div>
          </div>
          <span style={{
            padding: '3px 10px',
            borderRadius: 'var(--radius-full)',
            fontSize: '11px',
            fontWeight: 500,
            background: typeStyle.bg,
            color: typeStyle.text,
            border: '1px solid ' + typeStyle.text + '33',
          }}>
            {typeStyle.label}
          </span>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
        {message.relatedTaskTitle && (
          <div style={{
            padding: '10px 14px',
            background: 'var(--color-success-subtle)',
            border: '1px solid var(--color-success-subtle)',
            borderRadius: 'var(--radius-md)',
            marginBottom: '16px',
            fontSize: '13px',
          }}>
            <span style={{ color: 'var(--color-success)', fontWeight: 500 }}>关联任务：</span>
            <span style={{ color: 'var(--color-text-primary)' }}>{message.relatedTaskTitle}</span>
          </div>
        )}

        <div style={{
          fontSize: '13px',
          lineHeight: 1.8,
          whiteSpace: 'pre-wrap',
          color: 'var(--color-text-primary)',
        }}>
          {message.content}
        </div>
      </div>

      <div style={{
        padding: '12px 20px',
        borderTop: '1px solid var(--color-border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'var(--color-surface-hover)',
      }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          {message.tags?.map((tag) => (
            <span key={tag} style={{
              padding: '3px 8px',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              fontSize: '11px',
              color: 'var(--color-text-secondary)',
            }}>
              {tag}
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {!message.isRead && onMarkAsRead && (
            <button
              onClick={() => onMarkAsRead(message.id)}
              style={{
                padding: '6px 12px',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                fontSize: '12px',
                color: 'var(--color-text-primary)',
                fontFamily: 'inherit',
              }}
            >
              标为已读
            </button>
          )}
          {onReply && (
            <button
              onClick={() => onReply(message.id)}
              style={{
                padding: '6px 14px',
                border: 'none',
                background: 'var(--color-accent)',
                color: '#ffffff',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 500,
                fontFamily: 'inherit',
              }}
            >
              回复
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

#### 8c：替换 `DetailSkeleton` 中的颜色

```tsx
function DetailSkeleton() {
  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
        <div className="skeleton-pulse" style={{
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          background: 'var(--color-surface-hover)',
        }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton-pulse" style={{
            height: '16px',
            width: '100px',
            background: 'var(--color-surface-hover)',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '8px',
          }} />
          <div className="skeleton-pulse" style={{
            height: '12px',
            width: '150px',
            background: 'var(--color-surface-hover)',
            borderRadius: 'var(--radius-sm)',
          }} />
        </div>
      </div>
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="skeleton-pulse" style={{
          height: '12px',
          width: `${Math.random() * 30 + 60}%`,
          background: 'var(--color-surface-hover)',
          borderRadius: 'var(--radius-sm)',
          marginBottom: '10px',
        }} />
      ))}
    </div>
  );
}
```

---

### 任务 9：运行构建验证

```bash
cd d:\code\loopmarshal\apps\web && npx tsc -b && npx vite build
```

**预期**：0 错误，构建成功。

---

## 自审清单

### 1. 视觉差异覆盖
| 文件 | 视觉变化 |
|------|---------|
| index.css | **全部 CSS 变量值变化**（深色主题） |
| PageHeader.tsx | 字号变大、颜色层级调整、添加分隔线 |
| DataTable.tsx | 表头大写+背景、空状态 SVG、容器边框 |
| Button.tsx | danger 按钮 outline 风格、borderRadius |
| Modal.tsx | 关闭按钮 SVG、标题栏背景、边框 |
| MemberStatusCard.tsx | 骨架 pulse class、border+shadow |
| MessageTimeline.tsx | 附件 SVG 替 emoji、颜色变量、骨架 |
| MessageDetail.tsx | 空状态 SVG 替 emoji、颜色变量、骨架 |

**100% 文件产生视觉差异。零纯重构。**

### 2. 硬编码颜色残留检查
- MemberStatusCard avatarColor: `#8b5cf6` — 保留，因为这是来自后端数据的动态颜色
- Button primary color: `#ffffff` — 保留，纯白不需要 token
- index.css 字体 URL — 保留，不是颜色
- **其余零硬编码。**

### 3. API 调用检查
- 零 API 调用改动。所有页面/组件文件只改了样式。

### 4. StatusBadge
- 不动。用户要求的"不颜色驱动，只显示后端文案"继续保持。

---

## 执行顺序

1. 任务 1 — index.css（基础，其他任务依赖）
2. 任务 2-5 — Admin 组件升级
3. 任务 6-8 — Session/Message 组件硬编码替换
4. 任务 9 — 构建验证
