export default function SettingsActionResult(props: {
  message: string;
}) {
  if (!props.message) {
    return null;
  }
  return <div className="text-sm text-muted-foreground">{props.message}</div>;
}
