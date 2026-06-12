import { describe, it, expect } from "vitest";
import { normalizeUrl, domainOf, isAggregatorUrl, loadAggregatorRegistry } from "../lib/intake/registry";

const REG = { "worldschooly.com": { note: "" }, "theworldschoolatlas.com": { note: "" } };

describe("normalizeUrl", () => {
  it("returns null for empty/blank", () => {
    expect(normalizeUrl("")).toBeNull();
    expect(normalizeUrl("  ")).toBeNull();
    expect(normalizeUrl(undefined)).toBeNull();
    expect(normalizeUrl(null)).toBeNull();
  });
  it("adds https:// to scheme-less urls (the directory's common case)", () => {
    expect(normalizeUrl("worldschooly.com/hub/harmony-learning-center/"))
      .toBe("https://worldschooly.com/hub/harmony-learning-center/");
  });
  it("keeps existing scheme", () => {
    expect(normalizeUrl("http://example.com")).toBe("http://example.com");
  });
});

describe("domainOf", () => {
  it("strips www. and lowercases", () => {
    expect(domainOf("https://WWW.Example.com/x")).toBe("example.com");
  });
  it("works on scheme-less input", () => {
    expect(domainOf("boundless.life/hubs")).toBe("boundless.life");
  });
  it("returns empty string for garbage", () => {
    expect(domainOf("ht!tp://///")).toBe("");
  });
  it("strips trailing dot from FQDN-style hostnames", () => {
    expect(domainOf("https://example.com./path")).toBe("example.com");
  });
});

describe("isAggregatorUrl", () => {
  it("matches registry domains and subdomains", () => {
    expect(isAggregatorUrl("https://worldschooly.com/hub/x", REG)).toBe(true);
    expect(isAggregatorUrl("https://app.worldschooly.com/x", REG)).toBe(true);
  });
  it("does not match providers or null", () => {
    expect(isAggregatorUrl("https://boundless.life", REG)).toBe(false);
    expect(isAggregatorUrl(null, REG)).toBe(false);
  });
});

describe("loadAggregatorRegistry", () => {
  it("loads the checked-in registry with its seed domains", () => {
    const reg = loadAggregatorRegistry();
    expect(reg["worldschooly.com"]).toBeDefined();
    expect(reg["famunity.net"]).toBeDefined();
  });
});
