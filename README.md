# AI Novel Writing Assistant AI小说创作助手

[English](#english) | [中文](#chinese)

<a name="english"></a>
## English

### Introduction
AI Novel Writing Assistant is a modern web application built with Next.js that integrates with DeepSeek's AI models to provide intelligent novel writing and content generation capabilities. The application leverages advanced AI technology to enhance the creative writing process and assist authors in developing compelling stories efficiently.

### Features
- 🤖 AI-Powered Writing: Utilizes DeepSeek's advanced AI models for story generation and plot development
- ⚡ Real-time Assistance: Supports streaming responses for interactive writing experience
- 🎨 Modern UI: Built with Next.js and TailwindCSS for a beautiful, writer-friendly interface
- 🔒 Secure: Implements authentication and content protection
- 📚 Writing Tools: Comprehensive suite of tools for character development, plot structuring, and world-building

### Tech Stack
- **Frontend**: Next.js, React, TypeScript
- **Styling**: TailwindCSS, Radix UI
- **State Management**: Zustand
- **Database**: Prisma
- **Authentication**: NextAuth.js
- **AI Integration**: DeepSeek API

### Getting Started

1. Clone the repository
```bash
git clone [repository-url]
cd ai-novel-assistant
```

2. Install dependencies
```bash
npm install
# or
yarn install
```

3. Set up environment variables
```bash
cp .env.example .env
```
Fill in your DeepSeek API key and other required variables.

4. Run database migrations
```bash
npx prisma migrate dev
```

5. Start the development server
```bash
npm run dev
# or
yarn dev
```

### License
This project is licensed under the MIT License - see the LICENSE file for details.

---

<a name="chinese"></a>
## 中文

### 简介
AI小说创作助手是一个基于 Next.js 构建的现代 Web 应用，集成了 DeepSeek 的 AI 模型，提供智能小说创作和内容生成功能。该应用利用先进的 AI 技术来增强创作过程，帮助作者高效地开发引人入胜的故事。

### 功能特点
- 🤖 AI 驱动创作：使用 DeepSeek 的先进 AI 模型进行故事生成和情节发展
- ⚡ 实时创作辅助：支持流式响应以提供交互式写作体验
- 🎨 现代化界面：使用 Next.js 和 TailwindCSS 构建美观的写作友好界面
- 🔒 安全可靠：实现身份验证和内容保护
- 📚 写作工具：提供角色发展、情节构建和世界观设定等综合工具套件

### 技术栈
- **前端框架**: Next.js, React, TypeScript
- **样式方案**: TailwindCSS, Radix UI
- **状态管理**: Zustand
- **数据库**: Prisma
- **身份认证**: NextAuth.js
- **AI 集成**: DeepSeek API

### 快速开始

1. 克隆仓库
```bash
git clone [仓库地址]
cd ai-novel-assistant
```

2. 安装依赖
```bash
npm install
# 或
yarn install
```

3. 配置环境变量
```bash
cp .env.example .env
```
填写你的 DeepSeek API 密钥和其他必需的变量。

4. 运行数据库迁移
```bash
npx prisma migrate dev
```

5. 启动开发服务器
```bash
npm run dev
# 或
yarn dev
```

### 许可证
本项目采用 MIT 许可证 - 详见 LICENSE 文件。
