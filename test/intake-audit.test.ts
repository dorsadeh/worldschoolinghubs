import { describe, it, expect } from "vitest";
import {
  classifyLink, latestYearMentioned, suspectedAggregatorDomains, isSocialUrl,
} from "../lib/intake/audit";

const REG = { "worldschooly.com": { note: "" } };
const ok = (url: string, finalUrl = url, bodyText = "welcome 2026") =>
  ({ url, status: 200, finalUrl, bodyText });

describe("classifyLink", () => {
  it("aggregator domains → aggregator-link (the Harmony case)", () => {
    expect(classifyLink(ok("https://worldschooly.com/hub/harmony-learning-center/"), REG))
      .toBe("aggregator-link");
  });
  it("first-party social → ok-social", () => {
    expect(classifyLink(ok("https://facebook.com/groups/somehub"), REG)).toBe("ok-social");
    expect(classifyLink(ok("https://www.instagram.com/somehub/"), REG)).toBe("ok-social");
  });
  it("own site → ok-provider", () => {
    expect(classifyLink(ok("https://boundless.life/hubs"), REG)).toBe("ok-provider");
  });
  it("redirect that lands on an aggregator is aggregator-link, not redirected", () => {
    expect(classifyLink(ok("https://somehub.com", "https://worldschooly.com/hub/x"), REG))
      .toBe("aggregator-link");
  });
  it("cross-domain redirect → redirected", () => {
    expect(classifyLink(ok("https://oldhub.com", "https://newhub.org"), REG)).toBe("redirected");
  });
  it("same-domain redirect stays ok-provider", () => {
    expect(classifyLink(ok("https://hub.com", "https://hub.com/en/home"), REG)).toBe("ok-provider");
  });
  it("parked page text → parked", () => {
    expect(classifyLink(ok("https://hub.com", "https://hub.com", "This domain is for sale!"), REG))
      .toBe("parked");
  });
  it("first failure → unreachable", () => {
    expect(classifyLink({ url: "https://x.com", status: null, finalUrl: null, bodyText: "" }, REG))
      .toBe("unreachable");
    expect(classifyLink({ url: "https://x.com", status: 404, finalUrl: "https://x.com", bodyText: "" }, REG))
      .toBe("unreachable");
  });
  it("second failure ≥7 days after a previous unreachable → dead", () => {
    const prev = { verdict: "unreachable" as const, checkedAt: "2026-06-01T00:00:00Z" };
    expect(classifyLink(
      { url: "https://x.com", status: null, finalUrl: null, bodyText: "" },
      REG, prev, "2026-06-12T00:00:00Z",
    )).toBe("dead");
  });
  it("second failure only 2 days later stays unreachable", () => {
    const prev = { verdict: "unreachable" as const, checkedAt: "2026-06-10T00:00:00Z" };
    expect(classifyLink(
      { url: "https://x.com", status: null, finalUrl: null, bodyText: "" },
      REG, prev, "2026-06-12T00:00:00Z",
    )).toBe("unreachable");
  });
});

describe("latestYearMentioned", () => {
  it("returns the max plausible year", () => {
    expect(latestYearMentioned("sessions in 2023 and spring 2025!")).toBe(2025);
  });
  it("ignores implausible far-future years and returns null when none", () => {
    expect(latestYearMentioned("call 2099-555 now")).toBeNull();
    expect(latestYearMentioned("no years here")).toBeNull();
  });
});

describe("suspectedAggregatorDomains", () => {
  it("flags domains serving ≥3 entries that are not registry or social", () => {
    const urls = [
      "https://hubdir.org/a", "https://hubdir.org/b", "https://hubdir.org/c",
      "https://worldschooly.com/x", "https://worldschooly.com/y", "https://worldschooly.com/z",
      "https://facebook.com/1", "https://facebook.com/2", "https://facebook.com/3",
      "https://unique-provider.com/",
    ];
    expect(suspectedAggregatorDomains(urls, REG)).toEqual(["hubdir.org"]);
  });
});

describe("isSocialUrl", () => {
  it("covers fb/ig/whatsapp/telegram/linktree", () => {
    for (const u of [
      "https://m.facebook.com/x", "https://fb.me/x", "https://instagram.com/x",
      "https://chat.whatsapp.com/x", "https://t.me/x", "https://linktr.ee/x",
    ]) expect(isSocialUrl(u)).toBe(true);
    expect(isSocialUrl("https://boundless.life")).toBe(false);
  });
});
