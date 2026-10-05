# 厂商缓存请求适配

只有注册 Prompt 声明的稳定前缀具有明确边界，包含静态 System 规则及显式前置的静态输出骨架。边界以消息数组身份保存在 WeakMap，不写入请求、日志或高级模板；自定义数组不继承边界。只对官方 HTTPS 端点及已核验模型白名单加短 TTL cache_control；未知通道/模型、Ollama 和自动缓存路径原样发送。400 原样报告，不增加模型重试。设置 LLM_EXPLICIT_CACHE_ENABLED=false 后下一次正常请求不加显式标记，不影响自动缓存。

Claude 原生 system 保留多个文本块，正文的稳定第一块可缓存，章节篇幅与补写要求块保持动态；结构化调用还保留合并用户消息内的各文本块，静态骨架边界映射到对应块。百炼兼容路径将稳定消息文本转为带合法 marker 的内容块，不变更其他消息、角色和选定材料。无需预热；缓存收益取决于厂商阈值及有效期，仅以响应 usage 为准。Gemini 原生缓存对象生命周期不属于本模块。

协议核验：2026-10-05。官方文档：[Claude](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)、[百炼](https://www.alibabacloud.com/help/en/model-studio/context-cache)。新增模型/地域/中转须先核验，不能凭模型名字猜测参数支持。
