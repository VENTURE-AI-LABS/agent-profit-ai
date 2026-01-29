import { NextResponse } from "next/server";
import rawCaseStudies from "@/data/case-studies.json";
import type { CaseStudy } from "@/lib/types";
import { readLiveCaseStudiesFromBlob } from "@/lib/blobCaseStudies";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);

  // Parse query params
  const limitParam = url.searchParams.get("limit");
  const offsetParam = url.searchParams.get("offset");
  const statusParam = url.searchParams.get("status");
  const tagParam = url.searchParams.get("tag");
  const searchParam = url.searchParams.get("q") ?? url.searchParams.get("search");
  const sortParam = url.searchParams.get("sort") ?? "date";
  const orderParam = url.searchParams.get("order") ?? "desc";

  // Fetch case studies
  const fromBlob = await readLiveCaseStudiesFromBlob();
  const local = rawCaseStudies as unknown as CaseStudy[];
  let caseStudies = (fromBlob ?? local).slice();

  // Filter by status
  if (statusParam === "verified" || statusParam === "speculation") {
    caseStudies = caseStudies.filter((cs) => cs.status === statusParam);
  }

  // Filter by tag
  if (tagParam) {
    const tag = tagParam.toLowerCase();
    caseStudies = caseStudies.filter((cs) =>
      cs.tags.some((t) => t.toLowerCase().includes(tag))
    );
  }

  // Search in title, summary, description
  if (searchParam) {
    const search = searchParam.toLowerCase();
    caseStudies = caseStudies.filter(
      (cs) =>
        cs.title.toLowerCase().includes(search) ||
        cs.summary.toLowerCase().includes(search) ||
        cs.description.toLowerCase().includes(search)
    );
  }

  // Sort
  if (sortParam === "date") {
    caseStudies.sort((a, b) =>
      orderParam === "asc"
        ? a.date.localeCompare(b.date)
        : b.date.localeCompare(a.date)
    );
  } else if (sortParam === "title") {
    caseStudies.sort((a, b) =>
      orderParam === "asc"
        ? a.title.localeCompare(b.title)
        : b.title.localeCompare(a.title)
    );
  }

  const total = caseStudies.length;

  // Pagination
  const limit = limitParam ? Math.min(100, Math.max(1, parseInt(limitParam) || 50)) : 50;
  const offset = offsetParam ? Math.max(0, parseInt(offsetParam) || 0) : 0;
  caseStudies = caseStudies.slice(offset, offset + limit);

  // Get all unique tags for reference
  const allTags = Array.from(
    new Set(
      (fromBlob ?? local).flatMap((cs) => cs.tags)
    )
  ).sort();

  return NextResponse.json({
    success: true,
    data: caseStudies,
    meta: {
      total,
      limit,
      offset,
      hasMore: offset + caseStudies.length < total,
    },
    tags: allTags,
  });
}
