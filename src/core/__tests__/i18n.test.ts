import { describe, expect, it } from "vitest";
import { detectLang, initLang, t, LANGS } from "../i18n";

describe("i18n", () => {
  it("detects spanish from any es-* tag, english otherwise", () => {
    expect(detectLang("es-PE")).toBe("es");
    expect(detectLang("ES")).toBe("es");
    expect(detectLang("en-US")).toBe("en");
    expect(detectLang("pt-BR")).toBe("en");
    expect(detectLang(undefined)).toBe("en");
  });

  it("auto follows the system, explicit wins", () => {
    expect(initLang("auto", "es-PE")).toBe("es");
    expect(initLang("auto", "en-GB")).toBe("en");
    expect(initLang("es", "en-GB")).toBe("es");
  });

  it("interpolates placeholders", () => {
    initLang("en", undefined);
    expect(t("ev.push.title", { who: "ana", repo: "x/y" })).toBe("ana pushed to x/y");
    initLang("es", undefined);
    expect(t("ev.push.title", { who: "ana", repo: "x/y" })).toBe("ana hizo push a x/y");
  });

  it("every key exists in every language", async () => {
    // import the raw dictionary through the module's typed surface:
    // if a key is missing in one language, t() falls back to es, so we
    // compare rendered strings across languages for divergence instead
    const mod = await import("../i18n");
    const keys = Object.keys((mod as any).__dict?.es ?? {});
    expect(LANGS.length).toBe(2);
    // sanity: dictionary is exposed for tests
    expect(keys.length).toBeGreaterThan(50);
    for (const lang of LANGS) {
      const missing = keys.filter((k) => !(k in (mod as any).__dict[lang]));
      expect(missing, `missing in ${lang}`).toEqual([]);
    }
  });
});
