"use client";

import { Fragment, useMemo, useState } from "react";
import type { CaseStudy } from "@/lib/types";
import MoneyText from "@/components/MoneyText";

type SortKey = "date" | "title" | "status";
type SortDir = "asc" | "desc";
type StatusFilter = "all" | "verified" | "speculation";

function daysFromTodayIso(dateIso: string) {
  // Treat YYYY-MM-DD as UTC midnight to avoid TZ surprises.
  const d = new Date(`${dateIso}T00:00:00Z`);
  const now = new Date();
  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  return Math.floor((todayUtc.getTime() - d.getTime()) / 86_400_000);
}

function formatDaysAgo(dateIso: string) {
  const days = daysFromTodayIso(dateIso);
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  if (days > 1) return `${days} days ago`;
  const ahead = Math.abs(days);
  if (ahead === 1) return "in 1 day";
  return `in ${ahead} days`;
}

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

function statusPillClasses(status: string) {
  const base =
    "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold";
  if (status === "verified") {
    return `${base} border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300`;
  }
  return `${base} border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900/60 dark:bg-orange-950/40 dark:text-orange-300`;
}

export default function CaseStudiesTable({
  caseStudies,
}: {
  caseStudies: CaseStudy[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const filteredAndSorted = useMemo(() => {
    const normalized = caseStudies.map((cs) => ({
      ...cs,
      status: cs.status ?? "speculation",
    }));
    const filtered =
      statusFilter === "all"
        ? normalized
        : normalized.filter((cs) => cs.status === statusFilter);
    return sortCaseStudies(filtered, sortKey, sortDir);
  }, [caseStudies, sortKey, sortDir, statusFilter]);

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
      <div className="flex flex-col gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-zinc-600 dark:text-zinc-400">
          Showing{" "}
          <span className="font-semibold text-zinc-900 dark:text-zinc-50">
            {filteredAndSorted.length}
          </span>{" "}
          of{" "}
          <span className="font-semibold text-zinc-900 dark:text-zinc-50">
            {caseStudies.length}
          </span>
        </div>

        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <span className="font-medium">Status</span>
          <select
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-600"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="all">All</option>
            <option value="verified">Verified</option>
            <option value="speculation">Speculation</option>
          </select>
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-separate border-spacing-0">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              <th className="w-10 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
                {/* expand */}
              </th>
              <th
                className="cursor-pointer select-none whitespace-nowrap border-b border-zinc-200 px-4 py-3 dark:border-zinc-800"
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
            {filteredAndSorted.map((cs) => {
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
                    <td className="min-w-[110px] border-b border-zinc-200 px-4 py-3 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
                      <div className="whitespace-nowrap font-mono text-xs">
                        {cs.date}
                      </div>
                      <div className="mt-1 whitespace-nowrap text-[11px]">
                        ({formatDaysAgo(cs.date)})
                      </div>
                    </td>
                    <td className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
                      <div className="text-base font-semibold leading-6">
                        <MoneyText text={cs.title} />
                      </div>
                    </td>
                    <td className="border-b border-zinc-200 px-4 py-3 text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
                      <div className="leading-6">
                        <MoneyText text={cs.summary} />
                      </div>
                      {!!cs.tags?.length && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {cs.tags.slice(0, 8).map((t) => (
                            <span key={t} className={pillClasses()}>
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
                      <span className={statusPillClasses(cs.status ?? "speculation")}>
                        {cs.status ?? "speculation"}
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

