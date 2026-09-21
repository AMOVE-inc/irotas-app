import { describe, expect, it } from "vitest";
import {
  admissionAccessError,
  handleAdmissionStatusRequest,
} from "../sites/admission-status";

describe("admission status and membership guidance", () => {
  it("distinguishes an applicant who has not passed review", () => {
    expect(admissionAccessError(null, null)).toEqual({
      code: "ADMISSION_NOT_APPROVED",
      message:
        "入会審査の通過を確認できません。審査完了後、通過された方にのみ別途メールにてご連絡させていただきます。",
    });
  });

  it("tells an approved applicant that payment is still required", () => {
    expect(
      admissionAccessError(
        { status: "approved", expires_at: "2026-09-24T07:16:00.000Z" },
        null,
        new Date("2026-09-21T09:00:00.000Z"),
      ),
    ).toEqual({
      code: "MEMBERSHIP_PAYMENT_REQUIRED",
      message:
        "入会審査は通過していますが、会費の決済完了を確認できません。合格メールの決済リンクからお支払いください。",
    });
  });

  it("does not treat an expired approval as payment pending", () => {
    expect(
      admissionAccessError(
        { status: "approved", expires_at: "2026-09-20T07:16:00.000Z" },
        null,
        new Date("2026-09-21T09:00:00.000Z"),
      ).code,
    ).toBe("ADMISSION_NOT_APPROVED");
  });

  it("keeps overdue existing members separate from initial payment", () => {
    expect(
      admissionAccessError(
        { status: "approved", expires_at: null },
        { billing_status: "OVERDUE_BLOCKED", access_status: "active" },
      ).code,
    ).toBe("MEMBERSHIP_PAYMENT_PROBLEM");
  });

  it("accepts a signed server-to-server review update", async () => {
    const values: unknown[][] = [];
    const db = {
      prepare() {
        return {
          bind(...input: unknown[]) {
            values.push(input);
            return { async run() { return { success: true }; } };
          },
        };
      },
    };
    const response = await handleAdmissionStatusRequest(
      new Request("https://app.example/api/internal/admission-status", {
        method: "POST",
        headers: {
          authorization: "Bearer sync-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: " Applicant@Example.COM ",
          status: "approved",
          decidedAt: "2026-09-21T07:16:00.000Z",
          expiresAt: "2026-09-24T07:16:00.000Z",
        }),
      }),
      { DB: db, ADMISSION_SYNC_TOKEN: "sync-secret" } as never,
    );
    expect(response?.status).toBe(200);
    expect(values[0]?.slice(0, 4)).toEqual([
      "applicant@example.com",
      "approved",
      "2026-09-21T07:16:00.000Z",
      "2026-09-24T07:16:00.000Z",
    ]);
  });

  it("rejects review updates without the shared secret", async () => {
    const response = await handleAdmissionStatusRequest(
      new Request("https://app.example/api/internal/admission-status", {
        method: "POST",
      }),
      { DB: {}, ADMISSION_SYNC_TOKEN: "sync-secret" } as never,
    );
    expect(response?.status).toBe(401);
  });
});
