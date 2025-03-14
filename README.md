# AI Novel Writing Assistant AI小说创作助手

## 这是对AI完全接入项目开发的一次尝试
## 项目中所有代码都是AI编写
## 目标：只需要进行书名配置 和 点击确认按钮 即可生成（理想）小说

[中文](#chinese) | [English](#english)

<a name="chinese"></a>
## 中文

### 简介
AI小说创作助手是一个基于 Next.js 构建的现代 Web 应用，集成了 DeepSeek 的 AI 模型，提供智能小说创作和内容生成功能。该应用利用先进的 AI 技术来增强创作过程，帮助作者高效地开发引人入胜的故事。

### 已完成功能
- 🎯 **AI 辅助创作**
  - AI 创建小说类型：自动生成合适的小说类型模板
  - AI 创建世界观：构建完整的世界设定，包括地理、文化、魔法系统等
  - AI 创建小说发展走向：智能规划故事发展方向
  - AI 生成结构大纲：自动生成章节结构和内容框架
  - AI 角色设计：智能生成角色背景、性格特征
  - AI 情节优化：提供情节发展建议和优化方案
- ✅ **写作公式模块**
  - 提取写作风格和公式
  - 存储和管理多种写作模板
  - 分析句式结构、词汇水平和修辞手法
- ✅ **内容发布功能**
  - 支持作品在线发布
  - 内容格式化和处理
- ✅ **世界观生成**
  - 自动构建完整世界设定
  - 包括地理、文化、魔法系统等元素
- ✅ **AI对话组件**
  - 支持与AI进行创意讨论
  - 流式输出响应
- ✅ **角色管理系统**
  - 基础角色库
  - 角色模板功能
  - 角色详细属性设置
- ✅ **多LLM模型支持**
  - 支持切换不同AI模型
  - 集成DeepSeek、OpenAI、Anthropic等AI服务

### 待开发功能
- 📝 创作增强
  - 多人协作创作：支持多作者共同创作同一部小说
  - 版本控制：支持内容的版本管理和回滚
  - 分支创作：支持故事情节的多分支发展
  - 智能校对：语法检查和文风统一性分析
  - 写作建议：实时提供写作技巧和改进建议
  - 角色关系图：可视化展示角色之间的关系网络
  - 时间线管理：故事时间线的可视化管理

- 🎨 界面优化
  - 自定义主题：支持个性化界面主题设置
  - 移动端适配：优化移动设备的使用体验
  - 富文本编辑器：支持更丰富的文本编辑功能
  - 实时预览：支持分屏实时预览渲染效果

- 🔄 AI 功能增强
  - 多模型支持：集成更多 AI 模型供选择
  - 风格迁移：将已有内容转换为不同的写作风格
  - 情感分析：分析文本的情感走向和张力变化
  - 智能续写：基于上下文的智能情节续写
  - 角色对话生成：自动生成符合角色特征的对话
  - 场景描写优化：增强环境和氛围的描写质量

- 📊 数据分析
  - 创作数据统计：字数、创作时间等统计分析
  - 读者反馈分析：收集和分析读者评论和建议
  - 情节热度分析：分析情节的吸引力和关注度
  - 写作模式分析：个人写作习惯和风格分析

- 🔗 社区功能
  - 作品发布：支持作品的在线发布和分享
  - 读者互动：支持读者评论和反馈
  - 创作社区：作者之间的交流和经验分享
  - 创作比赛：支持举办小说创作竞赛

- 💾 数据导出
  - 多格式导出：支持 PDF、EPUB、MOBI 等格式
  - 自定义排版：支持导出作品的排版定制
  - 封面生成：AI 辅助的封面设计功能
  - 发布渠道集成：对接主流小说发布平台

### 功能特点
- 🤖 AI 驱动创作：使用 DeepSeek 的先进 AI 模型进行故事生成和情节发展
- ⚡ 实时创作辅助：支持流式响应以提供交互式写作体验
- 🎨 现代化界面：使用 Next.js 和 TailwindCSS 构建美观的写作友好界面
- 🔒 安全可靠：实现身份验证和内容保护
- 📚 写作工具：提供角色发展、情节构建和世界观设定等综合工具套件

### 技术栈
- **前端框架**: Next.js 15 (App Router), React, TypeScript
- **样式方案**: TailwindCSS, Shadcn/ui
- **状态管理**: React Context + Hooks
- **数据库**: Prisma + SQLite
- **身份认证**: NextAuth.js
- **AI 集成**: DeepSeek API

### 快速开始

1. 克隆仓库
```bash
git clone https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant.git
cd AI-Novel-Writing-Assistant
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
在`.env`文件中填写以下配置:
- `DATABASE_URL`: SQLite数据库路径
- `NEXTAUTH_URL`: 你的应用URL (开发环境通常是 http://localhost:3000)
- `NEXTAUTH_SECRET`: NextAuth认证密钥
- `OPENAI_API_KEY`: OpenAI API密钥
- `ANTHROPIC_API_KEY`: Anthropic API密钥
- `DEEPSEEK_API_KEY`: DeepSeek API密钥（如果使用）

4. 初始化数据库
```bash
npx prisma migrate dev
npx prisma db seed
```

5. 启动开发服务器
```bash
npm run dev
# 或
yarn dev
```

应用将在 [http://localhost:3000](http://localhost:3000) 启动。

### 许可证
本项目采用 MIT 许可证 - 详见 LICENSE 文件。

---

## 项目技术栈和功能更新

### 技术栈详情
- **前端框架**: 
  - Next.js 15
  - React 19
  - TypeScript
- **UI/样式**:
  - TailwindCSS
  - Shadcn/ui（基于Radix UI组件库）
  - Framer Motion动画
  - Lucide React图标
- **状态管理**:
  - Zustand
  - React Context
- **数据库**:
  - Prisma ORM
  - SQLite数据库
- **AI集成**:
  - Anthropic Claude (通过@anthropic-ai/sdk)
  - OpenAI API (通过openai库)
  - LangChain框架集成 (@langchain/core, @langchain/openai, @langchain/deepseek)
- **认证**:
  - NextAuth.js
- **工具库**:
  - Zod (数据验证)
  - date-fns (日期处理)
  - React Query (@tanstack/react-query)
  - React-Markdown (Markdown渲染)
  - Sonner (Toast通知)

### 正在开发功能
- 🚧 **内容发布平台集成**
- 🚧 **多人协作功能**
- 🚧 **智能续写和情节优化**

---

<a name="english"></a>
## English

### Introduction
AI Novel Writing Assistant is a modern web application built with Next.js that integrates with DeepSeek's AI models to provide intelligent novel writing and content generation capabilities. The application leverages advanced AI technology to enhance the creative writing process and assist authors in developing compelling stories efficiently.

### Completed Features
- 🎯 **AI-Assisted Creation**
  - AI Genre Creation: Automatically generates suitable novel genre templates
  - AI World Building: Constructs complete world settings including geography, culture, magic systems, etc.
  - AI Story Development: Intelligently plans story progression
  - AI Structure Outline: Automatically generates chapter structure and content framework
  - AI Character Design: Intelligently generates character backgrounds and personality traits
  - AI Plot Optimization: Provides plot development suggestions and optimization solutions
- ✅ **Writing Formula Module**
  - Extract writing styles and formulas
  - Store and manage various writing templates
  - Analyze sentence structure, vocabulary level, and rhetorical devices
- ✅ **Content Publishing**
  - Support for online publishing of works
  - Content formatting and processing
- ✅ **World Building**
  - Automatic construction of complete world settings
  - Including geography, culture, magic systems, and other elements
- ✅ **AI Conversation Component**
  - Support for creative discussions with AI
  - Streaming output responses
- ✅ **Character Management System**
  - Base character library
  - Character template functionality
  - Detailed character attribute settings
- ✅ **Multi-LLM Model Support**
  - Support for switching between different AI models
  - Integration with DeepSeek, OpenAI, Anthropic, and other AI services

### Features
- 🤖 AI-Powered Writing: Utilizes DeepSeek's advanced AI models for story generation and plot development
- ⚡ Real-time Assistance: Supports streaming responses for interactive writing experience
- 🎨 Modern UI: Built with Next.js and TailwindCSS for a beautiful, writer-friendly interface
- 🔒 Secure: Implements authentication and content protection
- 📚 Writing Tools: Comprehensive suite of tools for character development, plot structuring, and world-building

### Tech Stack
- **Frontend**: Next.js 13 (App Router), React, TypeScript
- **Styling**: TailwindCSS, Shadcn/ui
- **State Management**: React Context + Hooks
- **Database**: Prisma + SQLite
- **Authentication**: NextAuth.js
- **AI Integration**: DeepSeek API

### Getting Started

1. Clone the repository
```bash
git clone https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant.git
cd AI-Novel-Writing-Assistant
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
Fill in the following configuration in the `.env` file:
- `DATABASE_URL`: SQLite database path
- `NEXTAUTH_URL`: Your application URL (typically http://localhost:3000 for development)
- `NEXTAUTH_SECRET`: NextAuth authentication secret
- `OPENAI_API_KEY`: OpenAI API key
- `ANTHROPIC_API_KEY`: Anthropic API key
- `DEEPSEEK_API_KEY`: DeepSeek API key (if used)

4. Initialize the database
```bash
npx prisma migrate dev
npx prisma db seed
```

5. Start the development server
```bash
npm run dev
# or
yarn dev
```

The application will be available at [http://localhost:3000](http://localhost:3000).

### License
This project is licensed under the MIT License - see the LICENSE file for details.

---

## Technology Stack and Feature Updates

### Detailed Tech Stack
- **Frontend Framework**: 
  - Next.js 15
  - React 19
  - TypeScript
- **UI/Styling**:
  - TailwindCSS
  - Shadcn/ui (based on Radix UI component library)
  - Framer Motion animations
  - Lucide React icons
- **State Management**:
  - Zustand
  - React Context
- **Database**:
  - Prisma ORM
  - SQLite database
- **AI Integration**:
  - Anthropic Claude (via @anthropic-ai/sdk)
  - OpenAI API (via openai library)
  - LangChain framework integration (@langchain/core, @langchain/openai, @langchain/deepseek)
- **Authentication**:
  - NextAuth.js
- **Utility Libraries**:
  - Zod (data validation)
  - date-fns (date handling)
  - React Query (@tanstack/react-query)
  - React-Markdown (Markdown rendering)
  - Sonner (Toast notifications)

### Features in Development
- 🚧 **Content Publishing Platform Integration**
- 🚧 **Collaborative Writing Functionality**
- 🚧 **Intelligent Continuation and Plot Optimization**
