import { describe, expect, it } from "vitest";
import { parseCouponDescription } from "../lib/coupon-description";

describe("coupon description formatting", () => {
  it("renders **wrapped text** as bold without the markers", () => {
    expect(parseCouponDescription("通常 **特典内容** 続き")).toEqual([
      { text: "通常 ", bold: false },
      { text: "特典内容", bold: true },
      { text: " 続き", bold: false },
    ]);
  });

  it("recognizes URLs and keeps trailing punctuation outside the link", () => {
    expect(parseCouponDescription("公式HP：https://tiamclinic.com/。" )).toEqual([
      { text: "公式HP：", bold: false },
      { text: "https://tiamclinic.com/", bold: false, url: "https://tiamclinic.com/" },
      { text: "。", bold: false },
    ]);
  });

  it("recognizes links inside bold text", () => {
    expect(parseCouponDescription("**公式LINE https://lin.ee/ljxlREBS**")).toEqual([
      { text: "公式LINE ", bold: true },
      { text: "https://lin.ee/ljxlREBS", bold: true, url: "https://lin.ee/ljxlREBS" },
    ]);
  });
});
