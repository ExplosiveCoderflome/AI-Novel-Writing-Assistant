import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface WritingFormulaBookStyleFlowProps {
  novelId: string;
  novelTitle?: string;
  onOpenAdvanced: () => void;
  onOpenCreate: () => void;
}

export default function WritingFormulaBookStyleFlow(props: WritingFormulaBookStyleFlowProps) {
  const {
    novelId,
    novelTitle,
    onOpenAdvanced,
    onOpenCreate,
  } = props;
  const novelRoute = novelId ? `/novels/${novelId}/edit` : "/novels";

  return (
    <Card className="border-slate-200/80 bg-white/90 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
      <CardHeader>
        <CardTitle>Set the default book-level writing method from the basic information of the novel</CardTitle>
        <div className="text-sm leading-7 text-muted-foreground">
          The writing engine is responsible for creating, testing and organizing writing assets. Which default writing method should be used for the current novel? Please go back to the basic information of the novel to confirm, and then enter the subsequent director and text process.
                          </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <div className="space-y-4 rounded-2xl border bg-slate-50/70 p-4">
            <div className="text-sm font-medium text-slate-900">Where should I enter now?</div>
            <div className="rounded-2xl border bg-white p-4 text-sm leading-7 text-slate-700">
              {novelId
                ? `当前小说${novelTitle ? `《${novelTitle}》` : ""}的“默认写法”已经放到小说基础信息页里。`
                : "Please first go to the basic information page of a certain novel and confirm the default writing method of the book level there."}
            </div>
            <div className="rounded-2xl border bg-slate-950 p-4 text-white">
              <div className="text-sm font-medium">What are the two entrances responsible for?</div>
              <div className="mt-3 space-y-2 text-sm leading-7 text-slate-200">
                <div>Novel page: Select the default writing method for the current novel, trigger recommendations, compare candidates, and decide when to bring in the automatic director.</div>
                <div>Writing engine: continues to be responsible for organizing writing assets, trial writing, removing AI flavor and rule management.</div>
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border bg-white p-4">
            <div className="text-sm font-medium text-slate-900">Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.</div>
            <div className="rounded-2xl border bg-slate-50/70 p-4 text-sm leading-7 text-slate-700">
              First go to the novel page to confirm the default writing method of this book. If there is no suitable writing method in the current asset library, return to the writing method engine to create or organize assets.
                                      </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild type="button">
                <Link to={novelRoute}>Go to the novel page to set the default writing method</Link>
              </Button>
              <Button type="button" variant="outline" onClick={onOpenAdvanced}>
                Edit current writing
                                            </Button>
              <Button type="button" variant="outline" onClick={onOpenCreate}>
                Create a new writing style
                                            </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
