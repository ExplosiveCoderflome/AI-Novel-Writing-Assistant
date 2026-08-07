import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DIRECTOR_CREATE_LINK,
  MANUAL_CREATE_LINK,
} from "./novelListViewModel";

export function NovelListEmptyState(props: {
  hasAnyNovel: boolean;
}) {
  return (
    <section className="py-12 text-center">
      <h2 className="text-xl font-semibold tracking-normal">
        {props.hasAnyNovel ? "No novels matching the filter criteria" : "No novel projects yet"}
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
        {props.hasAnyNovel ? "You can switch the filter criteria above, or create a new novel project." : "For first-time use, it's recommended to let the AI ​​director organize the direction, characters, world view, and chapter preparation."}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link to={DIRECTOR_CREATE_LINK}>AI automatic director opens book</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to={MANUAL_CREATE_LINK}>Create a novel manually</Link>
        </Button>
      </div>
    </section>
  );
}
