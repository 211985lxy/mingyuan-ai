import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  isMaterialReadyForProduction,
  getBlockingAiMaterials,
} from "@/lib/packaging-materials";
import type { MaterialAssignment } from "@/types/api";

describe("INFRA-01: OSS decoupling contract", () => {
  describe("durability gate", () => {
    it("Test 1: isMaterialReadyForProduction returns false for ai_pexels material with ossStatus pending", () => {
      const material: MaterialAssignment = {
        role: "product_detail",
        fileUrl: "https://example.com/photo.jpg",
        type: "image",
        source: "ai_pexels",
        ossStatus: "pending",
      };
      expect(isMaterialReadyForProduction(material)).toBe(false);
    });

    it("Test 2: isMaterialReadyForProduction returns true for ai_pexels material with ossStatus ready", () => {
      const material: MaterialAssignment = {
        role: "product_detail",
        fileUrl: "https://oss.example.com/pexels/photos/12345.jpg",
        type: "image",
        source: "ai_pexels",
        ossStatus: "ready",
      };
      expect(isMaterialReadyForProduction(material)).toBe(true);
    });

    it("Test 3: isMaterialReadyForProduction returns true for non-AI material (source manual) regardless of ossStatus", () => {
      const material: MaterialAssignment = {
        role: "customer_case",
        fileUrl: "https://example.com/manual-upload.jpg",
        type: "image",
        source: "manual_upload",
        ossStatus: "pending",
      };
      expect(isMaterialReadyForProduction(material)).toBe(true);
    });

    it("Test 3b: isMaterialReadyForProduction returns true for manual_library material regardless of ossStatus", () => {
      const material: MaterialAssignment = {
        role: "qualification",
        fileUrl: "https://example.com/library-asset.mp4",
        type: "video",
        source: "manual_library",
        ossStatus: "pending",
      };
      expect(isMaterialReadyForProduction(material)).toBe(true);
    });

    it("Test 4: getBlockingAiMaterials filters correctly — returns only pending AI materials from a mixed array", () => {
      const materials: MaterialAssignment[] = [
        {
          role: "product_detail",
          fileUrl: "https://oss.example.com/pexels/photos/1.jpg",
          type: "image",
          source: "ai_pexels",
          ossStatus: "ready",
        },
        {
          role: "store_environment",
          fileUrl: "https://example.com/photo2.jpg",
          type: "image",
          source: "ai_pexels",
          ossStatus: "pending",
        },
        {
          role: "process",
          fileUrl: "https://example.com/video1.mp4",
          type: "video",
          source: "ai_pixabay",
          ossStatus: "pending",
        },
        {
          role: "customer_case",
          fileUrl: "https://example.com/manual.jpg",
          type: "image",
          source: "manual_upload",
          ossStatus: "pending",
        },
      ];

      const blocking = getBlockingAiMaterials(materials);

      // Only pending AI materials should be returned (not manual, not ready)
      expect(blocking).toHaveLength(2);
      expect(blocking.every((m) => m.source === "ai_pexels" || m.source === "ai_pixabay")).toBe(true);
      expect(blocking.every((m) => m.ossStatus !== "ready")).toBe(true);
      // Manual upload with pending ossStatus must NOT appear
      expect(blocking.find((m) => m.source === "manual_upload")).toBeUndefined();
    });
  });

  describe("route.ts static analysis", () => {
    const routeSrc = fs.readFileSync(
      path.resolve(__dirname, "../../src/app/api/packaging-material-suggestions/route.ts"),
      "utf-8"
    );

    it("does not contain blocking await transferPexelsMediaToOss", () => {
      expect(routeSrc).not.toContain("await transferPexelsMediaToOss");
    });

    it("contains Promise.allSettled for async batch", () => {
      expect(routeSrc).toContain("Promise.allSettled");
    });

    it("does not use effectiveRow variable", () => {
      expect(routeSrc).not.toContain("effectiveRow");
    });
  });
});
