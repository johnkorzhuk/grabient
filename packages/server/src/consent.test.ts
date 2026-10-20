import { expect, test } from "vitest";
import { consentRule, type Place } from "./consent.ts";

test("a new account's newsletter starts by where its sign-up comes from", () => {
  const rows: [Place | undefined, string][] = [
    [{ country: "FR" }, "ask"],
    [{ country: "DE", isEUCountry: "1" }, "ask"],
    [{ country: "NO" }, "ask"],
    [{ country: "GI" }, "ask"],
    [{ country: "GB" }, "ask"],
    [{ country: "CH" }, "ask"],
    [{ country: "CA", regionCode: "QC" }, "ask"],
    [{ country: "CA", regionCode: "ON" }, "none"],
    [{ country: "TR" }, "ask"],
    [{ country: "CN" }, "ask"],
    [{ country: "VN" }, "ask"],
    [{ country: "AD" }, "ask"],
    [{ country: "MC" }, "ask"],
    [{ country: "SM" }, "ask"],
    [{ country: "VA" }, "ask"],
    [{ country: "JE" }, "ask"],
    [{ country: "GG" }, "ask"],
    [{ country: "IM" }, "ask"],
    [{ country: "US" }, "none"],
    [{ country: "US", regionCode: "QC" }, "none"],
    [{ country: "BR" }, "none"],
    [{ country: "XX" }, "ask"],
    [{ country: "T1" }, "ask"],
    [{}, "ask"],
    [undefined, "ask"]
  ];
  for (const [place, rule] of rows) expect([place, consentRule(place)]).toEqual([place, rule]);
});
