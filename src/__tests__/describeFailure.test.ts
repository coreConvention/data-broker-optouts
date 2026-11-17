import { describe, it, expect } from "vitest";
import { describeFailure } from "../utils/describeFailure.js";

describe("describeFailure", () => {
  it("never repeats the error's message", () => {
    const error = new Error('fill("https://broker.example/name/Zephyrine-Quillfeather/ZQ")');

    expect(describeFailure("the request", error)).toBe("the request failed unexpectedly");
  });

  it("passes on the kind of error when it is a plain class name", () => {
    const error = new Error("Timeout 30000ms exceeded");
    error.name = "TimeoutError";

    expect(describeFailure("the scan", error)).toBe("the scan failed unexpectedly (TimeoutError)");
  });

  it("drops a kind that is not a plain class name, since it could carry anything", () => {
    const error = new Error("boom");
    error.name = "Zephyrine Quillfeather <zq@example.test>";

    expect(describeFailure("the scan", error)).toBe("the scan failed unexpectedly");
  });

  it("copes with a thrown value that is not an Error", () => {
    expect(describeFailure("the check", "https://broker.example/name/Zephyrine-Quillfeather")).toBe(
      "the check failed unexpectedly"
    );
  });
});
