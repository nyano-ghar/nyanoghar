import { describe, expect, it } from "vitest";
import { buildPetMediaKey, isKeyForPet, isPrivateKey } from "./keys.js";

const PET_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const OTHER_PET_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("buildPetMediaKey", () => {
  it("scopes the key to the pet", () => {
    const key = buildPetMediaKey({ petId: PET_ID, visibility: "PUBLIC" }, "image/jpeg");
    expect(key.startsWith(`pets/${PET_ID}/`)).toBe(true);
    expect(key.endsWith(".jpg")).toBe(true);
  });

  it("puts private uploads behind a private/ prefix", () => {
    const key = buildPetMediaKey(
      { petId: PET_ID, visibility: "PRIVATE" },
      "application/pdf",
    );
    expect(key).toMatch(new RegExp(`^private/pets/${PET_ID}/`));
    expect(isPrivateKey(key)).toBe(true);
  });

  it("never reuses a key, so a retry cannot overwrite a stored object", () => {
    const first = buildPetMediaKey(
      { petId: PET_ID, visibility: "PUBLIC" },
      "image/png",
    );
    const second = buildPetMediaKey(
      { petId: PET_ID, visibility: "PUBLIC" },
      "image/png",
    );
    expect(first).not.toBe(second);
  });

  it("derives the extension from the content type, not a client filename", () => {
    expect(
      buildPetMediaKey({ petId: PET_ID, visibility: "PUBLIC" }, "video/quicktime"),
    ).toMatch(/\.mov$/);
    expect(
      buildPetMediaKey({ petId: PET_ID, visibility: "PUBLIC" }, "image/webp"),
    ).toMatch(/\.webp$/);
  });
});

describe("isKeyForPet", () => {
  it("accepts a key this server minted for the pet", () => {
    const key = buildPetMediaKey({ petId: PET_ID, visibility: "PUBLIC" }, "image/jpeg");
    expect(isKeyForPet(key, PET_ID)).toBe(true);
  });

  it("accepts a private key for the pet", () => {
    const key = buildPetMediaKey(
      { petId: PET_ID, visibility: "PRIVATE" },
      "image/jpeg",
    );
    expect(isKeyForPet(key, PET_ID)).toBe(true);
  });

  // The check that stops one owner attaching another owner's photo to their
  // own listing by confirming a key they guessed or observed.
  it("rejects a key belonging to a different pet", () => {
    const key = buildPetMediaKey(
      { petId: OTHER_PET_ID, visibility: "PUBLIC" },
      "image/jpeg",
    );
    expect(isKeyForPet(key, PET_ID)).toBe(false);
  });

  it("rejects path traversal", () => {
    expect(isKeyForPet(`pets/${PET_ID}/../../etc/passwd`, PET_ID)).toBe(false);
    expect(isKeyForPet(`../pets/${PET_ID}/a.jpg`, PET_ID)).toBe(false);
  });

  it("rejects absolute and doubled-slash keys", () => {
    expect(isKeyForPet(`/pets/${PET_ID}/aaaaaaaa.jpg`, PET_ID)).toBe(false);
    expect(isKeyForPet(`pets//${PET_ID}/aaaaaaaa.jpg`, PET_ID)).toBe(false);
  });

  it("rejects a key with no uuid filename", () => {
    expect(isKeyForPet(`pets/${PET_ID}/profile.jpg`, PET_ID)).toBe(false);
  });

  it("rejects a nested key under the pet prefix", () => {
    expect(
      isKeyForPet(
        `pets/${PET_ID}/nested/3f2504e0-4f89-11d3-9a0c-0305e82c3301.jpg`,
        PET_ID,
      ),
    ).toBe(false);
  });

  it("rejects an over-long key", () => {
    expect(isKeyForPet(`pets/${PET_ID}/${"a".repeat(1100)}.jpg`, PET_ID)).toBe(false);
  });

  // A pet id is interpolated into a regex; a caller controls the pet id in the
  // URL, so regex metacharacters must not widen the match.
  it("does not let regex metacharacters in the pet id widen the match", () => {
    expect(isKeyForPet(`pets/${PET_ID}/aaaaaaaa.jpg`, ".*")).toBe(false);
  });
});

describe("isPrivateKey", () => {
  it("distinguishes private from public keys", () => {
    expect(isPrivateKey(`private/pets/${PET_ID}/a.jpg`)).toBe(true);
    expect(isPrivateKey(`pets/${PET_ID}/a.jpg`)).toBe(false);
  });
});
