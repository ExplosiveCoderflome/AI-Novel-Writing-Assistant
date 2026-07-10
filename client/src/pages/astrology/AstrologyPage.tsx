import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AstrologyPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("gen.pages.astrology.AstrologyPage.gen_79df51a9")}</CardTitle>
        <CardDescription>{t("gen.pages.astrology.AstrologyPage.gen_473f55bf")}</CardDescription>
      </CardHeader>
      <CardContent>{t("gen.pages.astrology.AstrologyPage.gen_6f6dd5d7")}</CardContent>
    </Card>
  );
}
