import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
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
        {props.hasAnyNovel ? t("gen.pages.novels.components.list.NovelListEmptyState.gen_325f8c1a") : t("gen.pages.novels.components.list.NovelListEmptyState.gen_acec76d7")}
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
        {props.hasAnyNovel
          ? t("gen.pages.novels.components.list.NovelListEmptyState.gen_860e1882")
          : t("gen.pages.novels.components.list.NovelListEmptyState.gen_1c5e7b24")}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link to={DIRECTOR_CREATE_LINK}>{t("gen.pages.novels.components.list.NovelListEmptyState.aiAutoDirectorBookStart")}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to={MANUAL_CREATE_LINK}>{t("gen.pages.novels.components.list.NovelListEmptyState.gen_e40b8718")}</Link>
        </Button>
      </div>
    </section>
  );
}
