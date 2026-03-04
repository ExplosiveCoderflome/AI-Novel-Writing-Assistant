import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getWorldList } from "@/api/world";
import { queryKeys } from "@/api/queryKeys";

export default function WorldList() {
  const worldListQuery = useQuery({
    queryKey: queryKeys.worlds.all,
    queryFn: getWorldList,
  });

  const worlds = worldListQuery.data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button asChild>
          <Link to="/worlds/generator">生成新世界观</Link>
        </Button>
      </div>

      {worlds.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>暂无世界观</CardTitle>
            <CardDescription>点击“生成新世界观”开始创建。</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {worlds.map((world) => (
            <Card key={world.id}>
              <CardHeader>
                <CardTitle>{world.name}</CardTitle>
                <CardDescription>{world.description ?? "暂无描述"}</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {world.conflicts ?? world.geography ?? "暂无详细信息"}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
