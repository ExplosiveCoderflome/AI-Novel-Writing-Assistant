import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface TaskCenterSummaryCardsProps {
  runningCount: number;
  queuedCount: number;
  failedCount: number;
  completed24hCount: number;
}

export default function TaskCenterSummaryCards({
  runningCount,
  queuedCount,
  failedCount,
  completed24hCount,
}: TaskCenterSummaryCardsProps) {
  return (
    <div className="task-status-summary-grid grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">运行中</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold">{runningCount}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">排队中</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold">{queuedCount}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">失败</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold">{failedCount}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">24h 完成</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold">{completed24hCount}</div>
        </CardContent>
      </Card>
    </div>
  );
}
