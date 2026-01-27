import { Fragment } from "react";

const MONEY_RE =
  /\$\d[\d,]*(?:\.\d+)?(?:\s?(?:k|m|b|K|M|B))?(?:-\$\d[\d,]*(?:\.\d+)?(?:\s?(?:k|m|b|K|M|B))?)?/g;

function moneySpan(m: string) {
  return (
    <span className="font-semibold text-emerald-700 dark:text-emerald-400">
      {m}
    </span>
  );
}

export default function MoneyText({ text }: { text: string }) {
  // Render plain text with any $-amounts highlighted in bold green.
  // Works with whitespace-pre-wrap to preserve newlines.
  const matches = [...text.matchAll(MONEY_RE)];
  if (!matches.length) return <>{text}</>;

  const out: Array<React.ReactNode> = [];
  let lastIdx = 0;
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const idx = m.index ?? 0;
    const val = m[0] ?? "";

    if (idx > lastIdx) out.push(text.slice(lastIdx, idx));
    out.push(<Fragment key={`${idx}:${val}`}>{moneySpan(val)}</Fragment>);
    lastIdx = idx + val.length;
  }
  if (lastIdx < text.length) out.push(text.slice(lastIdx));

  return <>{out}</>;
}

