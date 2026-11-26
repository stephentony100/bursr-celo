import { encodeFunctionData, erc20Abi } from "viem";
import { describe, expect, it } from "vitest";
import { ATTRIBUTION_CODE, assertTagged, isTagged, tagCalldata } from "./tx";

const transfer = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: ["0x2222222222222222222222222222222222222222", 1_000_000n] });

describe("attribution tag", () => {
  it("is Bursr's assigned hackathon code", () => {
    expect(ATTRIBUTION_CODE).toBe("celo_b9a8cee0812d");
  });

  it("appends the ERC-8021 suffix to calldata, keeping the call itself intact", () => {
    const tagged = tagCalldata(transfer);
    expect(tagged.startsWith(transfer)).toBe(true);
    expect(tagged.endsWith("80218021802180218021802180218021")).toBe(true);
    expect(isTagged(tagged)).toBe(true);
  });

  it("tags only once", () => {
    expect(tagCalldata(tagCalldata(transfer))).toBe(tagCalldata(transfer));
  });

  it("tags a plain value transfer (empty data)", () => {
    expect(isTagged(tagCalldata("0x"))).toBe(true);
  });

  it("refuses untagged calldata, or calldata tagged with someone else's code", () => {
    expect(() => assertTagged(transfer)).toThrow(/attribution/);
    expect(() => assertTagged(`${transfer}0e63656c6f5f6f7468657231323334000e80218021802180218021802180218021`)).toThrow();
    expect(() => assertTagged(tagCalldata(transfer))).not.toThrow();
  });
});
