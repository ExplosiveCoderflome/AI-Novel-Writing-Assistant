CREATE UNIQUE INDEX "DirectorNextRunControl_novelId_active_key" ON "DirectorNextRunControl"("novelId") WHERE "status" IN ('queued', 'running', 'waiting_gate', 'paused');
