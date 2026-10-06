# 新导演调用归属

组合层包装步骤处理器，显式提供新 runId、小说及阶段。不得复用旧导演外键。正文作业在持久化 payload 中传递 directorNext.runId，worker 重新建立上下文；不能依赖 ALS 跨进程。台账不参与预算或恢复决策。
