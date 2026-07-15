# 🚀 LoopMarshal 开发环境启动指南

## 快速启动

### 方式一：使用统一启动命令（推荐）

```bash
# 在项目根目录执行
pnpm start
```

这将同时启动前端和后端服务！

---

### 方式二：分别启动

#### 启动后端
```bash
pnpm start:cli
```

#### 启动前端（新终端）
```bash
pnpm start:web
```

---

## 📱 访问地址

启动后访问：
- **前端**: http://localhost:5173
- **后端**: http://127.0.0.1:42688
- **WebSocket**: ws://127.0.0.1:42688

---

## 🎨 前端改造说明

### ✅ 已完成的改造

1. **移除 Tailwind CSS** - 使用纯 CSS 变量和类名
2. **设计系统升级** - 优雅奢华风设计
3. **组件库重构** - 10+ 可复用组件
4. **动画效果** - 20+ 动画关键帧
5. **响应式设计** - 移动端适配

### 🎯 设计亮点

- **色彩系统**: 优雅的深色主题 + 蓝色主色调
- **字体系统**: Inter + Plus Jakarta Sans + JetBrains Mono
- **动效系统**: 流畅的页面转场和交互反馈
- **组件系统**: Button、Card、Input、Modal 等

---

## 📋 可用命令

| 命令 | 说明 |
|---|---|
| `pnpm start` | 同时启动前端和后端 |
| `pnpm start:web` | 仅启动前端 |
| `pnpm start:cli` | 仅启动后端 |
| `pnpm build` | 构建所有项目 |
| `pnpm typecheck` | TypeScript 类型检查 |

---

## ⚠️ 注意事项

1. **首次启动**可能需要安装依赖，请耐心等待
2. **后端服务**必须启动，前端才能正常工作
3. **端口占用**：如果端口被占用，请先关闭占用端口的程序

---

## 🔧 故障排除

### 问题：样式没有加载
**解决方案**：
```bash
# 清除缓存
cd apps/web
rm -rf dist node_modules
pnpm install
pnpm dev
```

### 问题：端口被占用
**解决方案**：
```bash
# 查看占用端口的进程
netstat -ano | findstr :5173
netstat -ano | findstr :42688

# 关闭进程
taskkill /PID <进程ID> /F
```

---

## 🎉 开始使用

现在你可以启动项目了！

```bash
# 在项目根目录执行
pnpm start
```

启动后访问 http://localhost:5173 即可看到改造后的前端界面。

祝你使用愉快！🚀
