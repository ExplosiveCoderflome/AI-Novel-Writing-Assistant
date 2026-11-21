import { useId } from "react";

/** Two-ink geometric ornaments sized for the stage covers, including very small map scales. */
export function StageImprint({ stage }: { stage: string }) {
  const uid = useId().replace(/:/g, "");
  const engraving = `url(#${uid}-rule)`;
  const emboss = "var(--print-cut)";
  const paper = "var(--print-paper)";
  const accent = "var(--print-accent)";
  let plate;
  switch (stage) {
    case "opening":
      plate = <>
        <g fill="none" stroke={paper}>
          <circle cx="88" cy="49" r="42" strokeDasharray="1 4" strokeWidth="2" />
          <circle cx="88" cy="49" r="36" /><circle cx="88" cy="49" r="31" opacity=".48" />
          <path d="M33 49h110M88 -4v104" opacity=".52" />
        </g>
        <g transform="rotate(22 88 49)">
          <path fill={paper} d="m88 3 7 36 27 10-27 7-7 39-8-37-29-9 29-9z" />
          <path fill={accent} d="M88 3v46l7-10zM88 49l-8 9 8 37z" />
          <path fill={emboss} d="m51 49 37 0-8-9zM88 49l34 0-27 7z" />
        </g><circle cx="88" cy="49" r="4" fill={emboss} />
      </>;
      break;
    case "foundation":
      plate = <>
        <path d="M29 92V52a53 53 0 0 1 106 0v40z" fill={engraving} />
        <path d="M45 92V50a37 37 0 0 1 74 0v42h-12V50a25 25 0 0 0-50 0v42z" fill={paper} />
        <path d="M65 92V52a17 17 0 0 1 34 0v40z" fill={accent} />
        <g fill="none" stroke={paper} opacity=".78">
          <path d="M31 92V52a51 51 0 0 1 102 0v40M38 92V52a44 44 0 0 1 88 0v40M21 92h123M17 97h128" />
          <path d="M82 -3v16M23 51h15m87 0h15" />
        </g><path d="M80 92V58h4v34" fill={emboss} />
      </>;
      break;
    case "volumes":
      plate = <>
        <g fill="none" stroke={paper} opacity=".56">
          <circle cx="94" cy="40" r="33" strokeDasharray="1 3" />
          <circle cx="94" cy="40" r="29" />
        </g><circle cx="94" cy="40" r="23" fill={accent} />
        <path d="m16 89 42-57 26 35 17-23 37 45z" fill={paper} />
        <path d="m58 32 26 35-16 22-10-23zM101 44l37 45h-32z" fill={engraving} />
        <g fill="none" stroke={emboss} strokeWidth="1.5">
          <path d="m22 89 36-49m-30 49 30-41m-24 41 24-33m-18 33 18-25m18 25 25-34m-19 34 19-25" />
        </g><path d="M13 94h129m-120 4h100" stroke={paper} opacity=".65" />
      </>;
      break;
    case "preparation":
      plate = <>
        <g stroke={paper} fill="none" opacity=".55"><path d="M29 13h107M29 92h107M36 5v94M129 5v94" />
          <path d="M41 10v6m10-6v6m10-6v6m10-6v6m10-6v6m10-6v6m10-6v6m10-6v6m10-6v6" /></g>
        <path d="M42 23h81v59H42z" fill={paper} /><path d="M47 28h35v49H47z" fill={engraving} />
        <circle cx="65" cy="52" r="11" fill={emboss} /><circle cx="65" cy="52" r="6" fill={accent} />
        <path d="M88 28h29v20H88z" fill={accent} />
        <path d="M88 55h29m-29 5h29m-29 5h23m-23 5h28m-28 5h17" stroke={emboss} strokeWidth="1.7" />
        <path d="m28 85 10-5v10z" fill={accent} />
      </>;
      break;
    default:
      plate = <>
        <g transform="translate(80 82)" fill="none" stroke={paper}>
          {Array.from({ length: 13 }, (_, i) => <path key={i} transform={`rotate(${(i - 6) * 9})`} d="M0 0v-65q5-6 11-7l-5 66z" />)}
        </g>
        <path d="M18 67q32-4 62 16 29-20 61-16l-5 12q-28-2-56 11-29-13-55-11z" fill={paper} />
        <path d="m99 73 9-3-1 16-5-2-5 5z" fill={accent} />
        <path d="M26 85q27-3 54 10 27-13 53-10" fill="none" stroke={paper} />
      </>;
  }
  return <svg className="stage-imprint" viewBox="0 0 148 102" aria-hidden="true" focusable="false">
    <defs><pattern id={`${uid}-rule`} patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(29)">
      <rect width="4" height="4" fill={emboss} /><path d="M0 0v4" stroke={paper} strokeWidth="1.2" /></pattern></defs>
    {plate}
  </svg>;
}
