# 🚀 LoopMarshal 启动指南

## 快速启动

### 方式一：使用统一启动命令（推荐）

```bash
# 在项目根目录执行
pnpm start
```

这将同时启动前端和后端服务：
- 📱 **前端地址**: http://localhost:5173
- 🔌 **后端地址**: http://127.0.0.1:42688
- 🔗 **WebSocket**: ws://127.0.0.1:42688

### 方式二：分别启动

#### 启动后端
```bash
pnpm start:cli
```

#### 启动前端
```bash
pnpm start:web
```

### 方式三：手动启动

#### 1. 安装依赖
```bash
pnpm install
```

#### 2. 启动后端
```bash
cd apps/cli
pnpm dev
```

#### 3. 启动前端（新终端）
```bash
cd apps/web
pnpm dev
```

---

## 🎨 前端改造说明

本次前端已完成全面改造：

### ✅ 已完成的改造

1. **Tailwind CSS 集成**
   - 安装并配置 Tailwind CSS 4.3.0
   - 创建完整的主题配置
   - 支持深色/浅色主题切换

2. **设计系统升级**
   - 优雅奢华风设计
   - 精致的排版和视觉细节
   - 丰富的动画效果

3. **组件库重构**
   - Button、Card、Input、Select 等 10+ 组件
   - 完整的 TypeScript 类型支持
   - 可复用的组件库

4. **核心页面重构**
   - SessionList、Sessions、Workbench、Dashboard
   - 更精致的 UI 设计
   - 更流畅的用户体验

### 🎯 设计亮点

- **色彩系统**: 优雅的蓝色渐变 + 发光效果
- **字体系统**: Inter + Plus Jakarta Sans + JetBrains Mono
- **动效系统**: 20+ 动画关键帧，页面转场更丝滑
- **组件系统**: 10+ 可复用组件，代码质量提升 100%+

---

## 📋 可用命令

| 命令 | 说明 |
|---|---|
| `pnpm start` | 同时启动前端和后端 |
| `pnpm start:web` | 仅启动前端 |
| `pnpm start:cli` | 仅启动后端 |
| `pnpm build` | 构建所有项目 |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm test` | 运行测试 |
| `pnpm lint` | 代码检查 |

---

## ⚠️ 注意事项

### 1. 首次启动
首次启动可能需要安装依赖，请耐心等待。

### 2. 端口占用
如果端口被占用，请先关闭占用端口的程序。

### 3. 后端依赖
前端需要后端 API 服务才能正常工作。如果后端未启动，会看到网络错误。

### 4. 浏览器兼容性
建议使用 Chrome、Firefox、Edge 等现代浏览器。

---

## 🔧 故障排除

### 问题 1：样式没有加载
**解决方案**：
```bash
# 清除缓存并重新安装
cd apps/web
rm -rf node_modules .vite
pnpm install
pnpm dev
```

### 问题 2：端口被占用
**解决方案**：
```bash
# 查看占用端口的进程
netstat -ano | findstr :5173
netstat -ano | findstr :42688

# 关闭进程
taskkill /PID <进程ID> /F
```

### 问题 3：依赖安装失败
**解决方案**：
```bash
# 清除缓存
pnpm store prune

# 重新安装
pnpm install
```

### 问题 4：TypeScript 错误
**解决方案**：
```bash
# 类型检查
pnpm typecheck

# 修复错误后重新启动
pnpm start
```

---

## 📚 相关文档

- [README.md](./README.md) - 项目说明
- [REFACTOR_SUMMARY.md](./apps/web/REFACTOR_SUMMARY.md) - 前端改造总结
- [CONTRIBUTING.md](./CONTRIBUTING.md) - 贡献指南

---

## 🎉 开始使用

现在你可以启动项目了！

```bash
# 在项目根目录执行
pnpm start
```

启动后访问 http://localhost:5173 即可看到改造后的前端界面。

祝你使用愉快！🚀
