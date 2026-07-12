import { describe, it, expect } from "vitest";
import { computeQueryHash as pexelsHash } from "@/lib/pexels";
import { computeQueryHash as pixabayHash } from "@/lib/pixabay";
import { CACHE_SCHEMA_VERSION } from "@/lib/packaging-material-suggestions/contracts";

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

  describe("packaging material cache configuration", () => {
    it("defines CACHE_SCHEMA_VERSION = 2", () => {
      expect(CACHE_SCHEMA_VERSION).toBe(2);
    });
    it("changes provider cache hashes from the default schema version", () => {
      expect(pexelsHash({ ...baseQueryPexels, schemaVersion: CACHE_SCHEMA_VERSION }))
        .not.toBe(pexelsHash(baseQueryPexels));
      expect(pixabayHash({ ...baseQueryPixabay, schemaVersion: CACHE_SCHEMA_VERSION }))
        .not.toBe(pixabayHash(baseQueryPixabay));
    });
  });
});
