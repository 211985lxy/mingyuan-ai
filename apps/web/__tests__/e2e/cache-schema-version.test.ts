import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { computeQueryHash as pexelsHash } from "@/lib/pexels";
import { computeQueryHash as pixabayHash } from "@/lib/pixabay";

const baseQueryPexels = {
  query: "HVAC technician outdoor unit",
  mediaType: "photo",
  orientation: "landscape",
  size: "large",
  locale: "en-US",
  page: 1,
  perPage: 10,
};

const baseQueryPixabay = {
  query: "HVAC technician outdoor unit",
  mediaType: "photo",
  orientation: "horizontal",
  page: 1,
  perPage: 10,
};

describe("INFRA-02: Cache schema versioning", () => {
  describe("pexels computeQueryHash", () => {
    it("produces different hashes for different schemaVersions", () => {
      const v1 = pexelsHash({ ...baseQueryPexels, schemaVersion: 1 });
      const v2 = pexelsHash({ ...baseQueryPexels, schemaVersion: 2 });
      expect(v1).not.toBe(v2);
    });
    it("defaults to schemaVersion 1 when omitted", () => {
      const withoutVersion = pexelsHash(baseQueryPexels);
      const withVersion1 = pexelsHash({ ...baseQueryPexels, schemaVersion: 1 });
      expect(withoutVersion).toBe(withVersion1);
    });
  });

  describe("pixabay computeQueryHash", () => {
    it("produces different hashes for different schemaVersions", () => {
      const v1 = pixabayHash({ ...baseQueryPixabay, schemaVersion: 1 });
      const v2 = pixabayHash({ ...baseQueryPixabay, schemaVersion: 2 });
      expect(v1).not.toBe(v2);
    });
    it("defaults to schemaVersion 1 when omitted", () => {
      const withoutVersion = pixabayHash(baseQueryPixabay);
      const withVersion1 = pixabayHash({ ...baseQueryPixabay, schemaVersion: 1 });
      expect(withoutVersion).toBe(withVersion1);
    });
  });

  describe("route.ts static analysis", () => {
    const routeSrc = fs.readFileSync(
      path.resolve(__dirname, "../../src/app/api/packaging-material-suggestions/route.ts"),
      "utf-8"
    );
    it("defines CACHE_SCHEMA_VERSION = 2", () => {
      expect(routeSrc).toMatch(/const CACHE_SCHEMA_VERSION\s*=\s*2/);
    });
    it("passes schemaVersion in all cache create blocks", () => {
      const matches = routeSrc.match(/schemaVersion:\s*CACHE_SCHEMA_VERSION/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBeGreaterThanOrEqual(6);
    });
  });
});
