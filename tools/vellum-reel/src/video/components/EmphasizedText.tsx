export const EmphasizedText: React.FC<{text: string; emphasis?: string[]}> = ({text, emphasis = []}) => {
  const terms = emphasis.filter(Boolean).sort((a, b) => b.length - a.length);
  if (!terms.length) return <>{text}</>;
  const matcher = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'g');
  return <>{text.split(matcher).map((part, index) => terms.includes(part) ? <em key={`${part}-${index}`}>{part}</em> : part)}</>;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
