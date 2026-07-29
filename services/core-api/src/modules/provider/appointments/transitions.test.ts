import { describe, expect, it } from "vitest";
import {
  APPOINTMENT_TRANSITIONS,
  type AppointmentStatus,
  canTransition,
} from "./appointments.service.js";

describe("appointment transitions", () => {
  it("lets a provider confirm a requested appointment", () => {
    expect(canTransition("REQUESTED", "CONFIRMED", "provider")).toBe(true);
  });

  it("does not let a customer confirm their own request", () => {
    // Otherwise a customer could self-confirm and treat the slot as booked.
    expect(canTransition("REQUESTED", "CONFIRMED", "customer")).toBe(false);
  });

  it("lets either party cancel", () => {
    expect(canTransition("REQUESTED", "CANCELLED", "customer")).toBe(true);
    expect(canTransition("REQUESTED", "CANCELLED", "provider")).toBe(true);
    expect(canTransition("CONFIRMED", "CANCELLED", "customer")).toBe(true);
    expect(canTransition("CONFIRMED", "CANCELLED", "provider")).toBe(true);
  });

  it("only lets the provider complete or mark a no-show", () => {
    expect(canTransition("CONFIRMED", "COMPLETED", "provider")).toBe(true);
    expect(canTransition("CONFIRMED", "NO_SHOW", "provider")).toBe(true);
    expect(canTransition("CONFIRMED", "COMPLETED", "customer")).toBe(false);
    expect(canTransition("CONFIRMED", "NO_SHOW", "customer")).toBe(false);
  });

  it("cannot complete an appointment that was never confirmed", () => {
    expect(canTransition("REQUESTED", "COMPLETED", "provider")).toBe(false);
  });

  it("treats CANCELLED, COMPLETED and NO_SHOW as terminal", () => {
    const terminal: AppointmentStatus[] = ["CANCELLED", "COMPLETED", "NO_SHOW"];
    for (const status of terminal) {
      expect(APPOINTMENT_TRANSITIONS[status]).toHaveLength(0);
    }
  });

  it("allows a rescheduled appointment back to confirmed", () => {
    expect(canTransition("RESCHEDULED", "CONFIRMED", "provider")).toBe(true);
  });

  it("never allows a transition to the same status", () => {
    for (const [from, moves] of Object.entries(APPOINTMENT_TRANSITIONS)) {
      for (const move of moves) {
        expect(move.to).not.toBe(from);
      }
    }
  });
});
