import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";

export default function SettingsActionResult(props: {
  message: string;
}) {
  if (!props.message) {
    return null;
  }
  return <div className={`text-sm text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>{props.message}</div>;
}
