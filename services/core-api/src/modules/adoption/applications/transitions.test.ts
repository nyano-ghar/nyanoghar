import { APPLICATION_TRANSITIONS, type ApplicationStatus } from "@nyanoghar/contracts";
import { describe, expect, it } from "vitest";

const ALL_STATUSES = Object.keys(APPLICATION_TRANSITIONS) as ApplicationStatus[];

describe("application transition table", () => {
  it("covers every status", () => {
    expect(ALL_STATUSES).toHaveLength(9);
    for (const status of ALL_STATUSES) {
      expect(APPLICATION_TRANSITIONS[status]).toBeDefined();
    }
  });

  it("only targets statuses that exist", () => {
    for (const status of ALL_STATUSES) {
      for (const transition of APPLICATION_TRANSITIONS[status]) {
        expect(ALL_STATUSES).toContain(transition.to);
      }
    }
  });

  it("treats REJECTED, WITHDRAWN and COMPLETED as terminal", () => {
    expect(APPLICATION_TRANSITIONS.REJECTED).toEqual([]);
    expect(APPLICATION_TRANSITIONS.WITHDRAWN).toEqual([]);
    expect(APPLICATION_TRANSITIONS.COMPLETED).toEqual([]);
  });

  it("never lets an applicant approve their own application", () => {
    for (const status of ALL_STATUSES) {
      const applicantApprovals = APPLICATION_TRANSITIONS[status].filter(
        (transition) =>
          transition.actor === "applicant" &&
          ["APPROVED", "SHORTLISTED", "COMPLETED"].includes(transition.to),
      );
      expect(applicantApprovals).toEqual([]);
    }
  });

  it("only lets the applicant withdraw", () => {
    for (const status of ALL_STATUSES) {
      for (const transition of APPLICATION_TRANSITIONS[status]) {
        if (transition.to === "WITHDRAWN") {
          expect(transition.actor).toBe("applicant");
        }
      }
    }
  });

  it("reaches COMPLETED only from APPROVED", () => {
    const sources = ALL_STATUSES.filter((status) =>
      APPLICATION_TRANSITIONS[status].some((t) => t.to === "COMPLETED"),
    );
    expect(sources).toEqual(["APPROVED"]);
  });

  it("has no duplicate targets within a status", () => {
    for (const status of ALL_STATUSES) {
      const targets = APPLICATION_TRANSITIONS[status].map((t) => t.to);
      expect(new Set(targets).size).toBe(targets.length);
    }
  });
});
