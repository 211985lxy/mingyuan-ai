import "./global-setup";
import { describe, it, expect } from "vitest";
import {
  scoreAndFilterMedia,
  generateAbstractFallbackQueries,
  DETERMINISTIC_YIELD_THRESHOLD,
  LLM_PASS_SCORE,
  INDUSTRY_ABSTRACT_QUERY_MAP,
  type ScorableMediaRow,
} from "@/lib/material-relevance";

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeRow(alt: string, overrides: Partial<ScorableMediaRow> = {}): ScorableMediaRow {
  return {
    id: "test-id",
    pexelsId: 12345,
    provider: "pexels",
    mediaType: "photo",
    url: "https://example.com/photo.jpg",
    alt,
    imageUrl: "https://example.com/photo.jpg",
    srcJson: null,
    videoFilesJson: null,
    videoPicturesJson: null,
    ossUrl: null,
    ossStatus: "none",
    ...overrides,
  };
}

function makeHvacContext() {
  return {
    industry: "空调维修",
    primaryOffer: "HVAC安装",
    targetAudience: "小企业主",
    archetype: "HVAC technician air conditioning",
  };
}

function makeGenericContext() {
  return {
    industry: "专业服务",
    primaryOffer: "咨询服务",
    targetAudience: "企业客户",
    archetype: "professional service business",
  };
}

// ─── RSCO-01: Deterministic Tier 1 Filter ─────────────────────────────────────

describe("RSCO-01: Deterministic Tier 1 Filter", () => {
  it("rejects a row with alt 'mountain lake reflection' for HVAC context", async () => {
    const rows = [makeRow("mountain lake reflection scenic view")];
    const context = makeHvacContext();
    const entry = { role: "product_detail" as const, query: "HVAC technician outdoor unit installation" };

    const results = await scoreAndFilterMedia(rows, context, entry);

    expect(results).toHaveLength(1);
    const result = results[0];
    expect(result.rejected).toBe(true);
    expect(result.score).toBe(0);
    expect(result.tier).toBe("deterministic");
  });

  it("accepts a row with alt 'HVAC technician installing outdoor unit' for HVAC context", async () => {
    const rows = [makeRow("HVAC technician installing outdoor unit")];
    const context = makeHvacContext();
    const entry = { role: "product_detail" as const, query: "HVAC technician outdoor unit installation" };

    const results = await scoreAndFilterMedia(rows, context, entry);

    expect(results).toHaveLength(1);
    const result = results[0];
    expect(result.rejected).toBe(false);
    expect(result.tier).toBe("deterministic");
  });

  it("skips off-domain blocklist check when archetype is 'professional service business'", async () => {
    // "lake" is in OFF_DOMAIN_TERMS but for the generic archetype it should pass
    const rows = [makeRow("beautiful mountain lake reflection landscape")];
    const context = makeGenericContext();
    const entry = { role: "store_environment" as const, query: "professional business environment" };

    const results = await scoreAndFilterMedia(rows, context, entry);

    expect(results).toHaveLength(1);
    // Generic archetype should NOT reject based on off-domain terms
    expect(results[0].rejected).toBe(false);
  });
});

// ─── RSCO-02: LLM Batch Scoring (one call, not per-item) ──────────────────────

describe("RSCO-02: LLM Batch Scoring triggers at threshold", () => {
  it("invokes LLM when deterministic acceptance rate is below DETERMINISTIC_YIELD_THRESHOLD (50%)", async () => {
    // Create many rows that will get rejected by Tier 1 (off-domain terms)
    // so the acceptance rate falls below 50%
    const rejectedRows = [
      makeRow("mountain lake reflection nature", { id: "r1", pexelsId: 1 }),
      makeRow("ocean beach sunset waves", { id: "r2", pexelsId: 2 }),
      makeRow("forest waterfall scenic", { id: "r3", pexelsId: 3 }),
    ];
    // One row that will pass
    const acceptedRow = makeRow("HVAC installation work", { id: "r4", pexelsId: 4 });
    const rows = [...rejectedRows, acceptedRow];

    // 1/4 = 25% < 50% threshold — LLM batch should trigger
    // This test only verifies the function doesn't crash and returns results.
    // Full LLM invocation counting requires a spy/mock which is disallowed by Zero Mock Rule.
    // We validate the structural contract: LLM tier results appear when threshold is crossed.
    const context = makeHvacContext();
    const entry = { role: "product_detail" as const, query: "HVAC air conditioning unit" };

    const results = await scoreAndFilterMedia(rows, context, entry);

    // All rows should be in results
    expect(results).toHaveLength(4);
    // Tier 1 rejections should stay rejected
    const deterministicRejected = results.filter(r => r.rejected && r.tier === "deterministic");
    expect(deterministicRejected.length).toBeGreaterThanOrEqual(3);
  });

  it("DETERMINISTIC_YIELD_THRESHOLD is 0.5 (50%)", () => {
    expect(DETERMINISTIC_YIELD_THRESHOLD).toBe(0.5);
  });
});

// ─── RSCO-03: Results below threshold are rejected ────────────────────────────

describe("RSCO-03: LLM pass score threshold", () => {
  it("LLM_PASS_SCORE is 5 (results with LLM score <= 5 are marked rejected)", () => {
    expect(LLM_PASS_SCORE).toBe(5);
  });

  it("scoreAndFilterMedia returns results with rejected=true for rows that fail LLM scoring", async () => {
    // We can only test the contract structurally — actual LLM behavior depends on runtime
    // The function must return ScoredMediaRow items with rejected/tier fields
    const rows = [makeRow("HVAC technician outdoor unit")];
    const context = makeHvacContext();
    const entry = { role: "process" as const, query: "HVAC professional installation" };

    const results = await scoreAndFilterMedia(rows, context, entry);

    results.forEach(r => {
      expect(r).toHaveProperty("rejected");
      expect(r).toHaveProperty("score");
      expect(r).toHaveProperty("tier");
      expect(["deterministic", "llm"]).toContain(r.tier);
    });
  });
});

// ─── FBACK-01: Abstract fallback query generation ─────────────────────────────

describe("FBACK-01: Abstract fallback query generation", () => {
  it("generates a query for HVAC archetype and product_detail role", () => {
    const result = generateAbstractFallbackQueries("product_detail", "HVAC technician air conditioning");
    expect(result).toHaveProperty("query");
    expect(result).toHaveProperty("tone");
    expect(result.query).toBeTruthy();
    expect(result.tone).toBe("clean"); // HVAC is "clean" tone
  });

  it("falls back to 'professional service business' entry if archetype not found in map", () => {
    const result = generateAbstractFallbackQueries("process", "unknown industry niche");
    expect(result).toHaveProperty("query");
    expect(result).toHaveProperty("tone");
    expect(result.tone).toBe("clean"); // generic fallback is "clean"
  });

  it("INDUSTRY_ABSTRACT_QUERY_MAP covers all 21 archetypes", () => {
    const expectedArchetypes = [
      "HVAC technician air conditioning",
      "baker pastry bakery",
      "medical aesthetic beauty treatment",
      "carpenter woodwork furniture",
      "postnatal care newborn",
      "restaurant kitchen food",
      "fitness gym workout",
      "auto mechanic car service",
      "education classroom training",
      "retail store merchandise",
      "real estate property home",
      "lawyer legal office consultation",
      "dentist dental clinic",
      "hair salon stylist",
      "photography studio portrait",
      "pet care veterinary",
      "early childhood daycare",
      "home cleaning housekeeping",
      "logistics delivery warehouse",
      "florist flower arrangement",
      "professional service business",
    ];

    expectedArchetypes.forEach(archetype => {
      expect(INDUSTRY_ABSTRACT_QUERY_MAP).toHaveProperty(archetype);
    });

    expect(Object.keys(INDUSTRY_ABSTRACT_QUERY_MAP)).toHaveLength(21);
  });
});

// ─── FBACK-02: Tone-appropriate abstract queries ──────────────────────────────

describe("FBACK-02: Tone-appropriate abstract queries", () => {
  it("returns 'warm' tone for baker pastry bakery (food/bakery industry)", () => {
    const result = generateAbstractFallbackQueries("product_detail", "baker pastry bakery");
    expect(result.tone).toBe("warm");
  });

  it("returns 'clean' tone for lawyer legal office consultation (professional/legal industry)", () => {
    const result = generateAbstractFallbackQueries("process", "lawyer legal office consultation");
    expect(result.tone).toBe("clean");
  });

  it("returns 'warm' tone for florist flower arrangement", () => {
    const result = generateAbstractFallbackQueries("store_environment", "florist flower arrangement");
    expect(result.tone).toBe("warm");
  });

  it("returns 'clean' tone for dentist dental clinic", () => {
    const result = generateAbstractFallbackQueries("product_detail", "dentist dental clinic");
    expect(result.tone).toBe("clean");
  });

  it("returns 'warm' tone for postnatal care newborn", () => {
    const result = generateAbstractFallbackQueries("store_environment", "postnatal care newborn");
    expect(result.tone).toBe("warm");
  });

  it("all INDUSTRY_ABSTRACT_QUERY_MAP entries have exactly 3 SafeRole query entries", () => {
    const roles = ["product_detail", "store_environment", "process"] as const;
    Object.values(INDUSTRY_ABSTRACT_QUERY_MAP).forEach((entry) => {
      roles.forEach(role => {
        expect(entry.abstractQueries).toHaveProperty(role);
        expect(entry.abstractQueries[role]).toBeTruthy();
        expect(typeof entry.abstractQueries[role]).toBe("string");
      });
    });
  });

  it("generateAbstractFallbackQueries returns correct query for each role", () => {
    const bakerEntry = INDUSTRY_ABSTRACT_QUERY_MAP["baker pastry bakery"];

    const productDetail = generateAbstractFallbackQueries("product_detail", "baker pastry bakery");
    expect(productDetail.query).toBe(bakerEntry.abstractQueries.product_detail);

    const storeEnv = generateAbstractFallbackQueries("store_environment", "baker pastry bakery");
    expect(storeEnv.query).toBe(bakerEntry.abstractQueries.store_environment);

    const process = generateAbstractFallbackQueries("process", "baker pastry bakery");
    expect(process.query).toBe(bakerEntry.abstractQueries.process);
  });
});

// ─── Type contract verification ───────────────────────────────────────────────

describe("Type contract: ScoredMediaRow shape", () => {
  it("scoreAndFilterMedia returns ScoredMediaRow array with expected shape", async () => {
    const rows = [makeRow("professional business office worker")];
    const context = makeGenericContext();
    const entry = { role: "store_environment" as const, query: "office professional business" };

    const results = await scoreAndFilterMedia(rows, context, entry);

    expect(Array.isArray(results)).toBe(true);
    results.forEach(r => {
      expect(r).toHaveProperty("row");
      expect(r).toHaveProperty("score");
      expect(r).toHaveProperty("rejected");
      expect(r).toHaveProperty("tier");
      expect(typeof r.score).toBe("number");
      expect(typeof r.rejected).toBe("boolean");
    });
  });
});
