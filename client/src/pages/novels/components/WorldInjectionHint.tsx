interface WorldInjectionHintProps {
  worldInjectionSummary: string | null;
}

export default function WorldInjectionHint({ worldInjectionSummary }: WorldInjectionHintProps) {
  return (
    <div className="rounded-md border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-900">
      {worldInjectionSummary ? (
        <div className="space-y-1">
          <div className="font-semibold">The book world participates in this generation</div>
          <pre className="whitespace-pre-wrap">{worldInjectionSummary}</pre>
        </div>
      ) : (
        <div>In the absence of a usable book world, the generation process will first proceed based on the basic information of the novel.</div>
      )}
    </div>
  );
}
