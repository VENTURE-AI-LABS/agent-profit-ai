"use client";

import { Fragment, useMemo, useState } from "react";
import type { CaseStudy } from "@/lib/types";
import MoneyText from "@/components/MoneyText";

type SortKey = "date" | "title" | "status";
type SortDir = "asc" | "desc";

function compareNullable(a: string | undefined, b: string | undefined) {
  return (a ?? "").localeCompare(b ?? "", undefined, { sensitivity: "base" });
}

function sortCaseStudies(items: CaseStudy[], key: SortKey, dir: SortDir) {
  const mul = dir === "asc" ? 1 : -1;
  const copy = [...items];
  copy.sort((a, b) => {
    if (key === "date") {
      // ISO YYYY-MM-DD sorts lexicographically.
      return mul * a.date.localeCompare(b.date);
    }
    if (key === "title") {
      return mul * a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    }
    return mul * compareNullable(a.status, b.status);
  });
  return copy;
}

function pillClasses() {
  return "inline-flex items-center rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200";
}

export default function CaseStudiesTable({
  caseStudies,
}: {
  caseStudies: CaseStudy[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const sorted = useMemo(
    () => sortCaseStudies(caseStudies, sortKey, sortDir),
    [caseStudies, sortKey, sortDir],
  );

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "date" ? "desc" : "asc");
  }

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  if (!caseStudies.length) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
        <div className="font-semibold text-zinc-900 dark:text-zinc-50">
          No case studies yet.
        </div>
        <div className="mt-1 leading-6">
          Add your first entry to <code className="font-mono">src/data/case-studies.json</code>.
          The included project skill can also help discover new entries with proof.
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-separate border-spacing-0">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              <th className="w-10 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
                {/* expand */}
              </th>
              <th
                className="cursor-pointer select-none border-b border-zinc-200 px-4 py-3 dark:border-zinc-800"
                onClick={() => toggleSort("date")}
              >
                Date {sortKey === "date" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </th>
              <th
                className="cursor-pointer select-none border-b border-zinc-200 px-4 py-3 dark:border-zinc-800"
                onClick={() => toggleSort("title")}
              >
                Title{" "}
                {sortKey === "title" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </th>
              <th className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
                Summary
              </th>
              <th
                className="cursor-pointer select-none border-b border-zinc-200 px-4 py-3 dark:border-zinc-800"
                onClick={() => toggleSort("status")}
              >
                Status{" "}
                {sortKey === "status" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((cs) => {
              const expanded = !!expandedIds[cs.id];
              return (
                <Fragment key={cs.id}>
                  <tr
                    className="cursor-pointer align-top text-sm text-zinc-800 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800/40"
                    onClick={() => toggleExpanded(cs.id)}
                  >
                    <td className="border-b border-zinc-200 px-4 py-3 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                      <span className="font-mono">{expanded ? "−" : "+"}</span>
                    </td>
                    <td className="border-b border-zinc-200 px-4 py-3 font-mono text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
                      {cs.date}
                    </td>
                    <td className="border-b border-zinc-200 px-4 py-3 font-medium dark:border-zinc-800">
                      <MoneyText text={cs.title} />
                      {!!cs.tags?.length && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {cs.tags.slice(0, 6).map((t) => (
                            <span key={t} className={pillClasses()}>
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="border-b border-zinc-200 px-4 py-3 text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
                      <MoneyText text={cs.summary} />
                    </td>
                    <td className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
                      <span className={pillClasses()}>
                        {cs.status ?? "unverified"}
                      </span>
                    </td>
                  </tr>
                  {expanded && (
                    <tr key={`${cs.id}__expanded`}>
                      <td
                        className="border-b border-zinc-200 bg-zinc-50 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-950"
                        colSpan={5}
                      >
                        <div className="grid gap-6 md:grid-cols-3">
                          <div className="md:col-span-2">
                            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                              How it works
                            </div>
                            <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-800 dark:text-zinc-200">
                              <MoneyText text={cs.description} />
                            </div>

                            {!!cs.profitMechanisms?.length && (
                              <div className="mt-5">
                                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                                  Profit mechanisms
                                </div>
                                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-800 dark:text-zinc-200">
                                  {cs.profitMechanisms.map((m) => (
                                    <li key={m}>
                                      <MoneyText text={m} />
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>

                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                              Proof sources
                            </div>
                            {cs.proofSources?.length ? (
                              <ul className="mt-2 space-y-2 text-sm">
                                {cs.proofSources.map((s) => (
                                  <li key={`${cs.id}:${s.url}`} className="leading-6">
                                    <a
                                      className="wrap-break-word font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-50"
                                      href={s.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {s.label}
                                    </a>
                                    {s.kind && (
                                      <div className="text-xs text-zinc-500 dark:text-zinc-400">
                                        {s.kind}
                                      </div>
                                    )}
                                    {s.excerpt && (
                                      <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                                        <MoneyText text={s.excerpt} />
                                      </div>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                                No sources yet.
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

