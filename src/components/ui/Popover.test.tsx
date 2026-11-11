import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Popover, placePopover } from "./Popover";

/** jsdom has no layout: stub the viewport, the anchor rect and the popover's natural size. */
function stubLayout(view: { w: number; h: number }, size: { w: number; h: number }) {
  const saved = {
    iw: window.innerWidth,
    ih: window.innerHeight,
    ow: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth"),
    sh: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight"),
  };
  Object.assign(window, { innerWidth: view.w, innerHeight: view.h });
  const isPop = (el: HTMLElement) => el.getAttribute("role") === "presentation";
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get(this: HTMLElement) { return isPop(this) ? size.w : 0; },
  });
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get(this: HTMLElement) { return isPop(this) ? size.h : 0; },
  });
  return () => {
    Object.assign(window, { innerWidth: saved.iw, innerHeight: saved.ih });
    for (const [k, d] of [["offsetWidth", saved.ow], ["scrollHeight", saved.sh]] as const) {
      if (d) Object.defineProperty(HTMLElement.prototype, k, d);
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[k];
    }
  };
}

function anchorAt(r: { top: number; left: number; w: number; h: number }) {
  const a = document.createElement("button");
  a.dataset.anchor = "";
  document.body.appendChild(a);
  a.getBoundingClientRect = () =>
    ({ top: r.top, left: r.left, bottom: r.top + r.h, right: r.left + r.w, width: r.w, height: r.h, x: r.left, y: r.top, toJSON() {} }) as DOMRect;
  return a;
}

describe("Popover placement", () => {
  let restore = () => {};
  afterEach(() => {
    cleanup();
    restore();
    document.querySelectorAll("[data-anchor]").forEach((n) => n.remove());
  });
  beforeEach(() => {
    restore = () => {};
  });

  const show = (anchor: HTMLElement) => {
    render(<Popover anchor={anchor} open onClose={() => {}}><div>conteúdo</div></Popover>);
    return screen.getByRole("presentation");
  };

  it("opens below when it fits, keeping 8px from the right edge", () => {
    restore = stubLayout({ w: 400, h: 600 }, { w: 168, h: 196 });
    const el = show(anchorAt({ top: 100, left: 380, w: 40, h: 30 }));
    expect(el.style.top).toBe("136px");
    expect(el.style.left).toBe("224px");
    expect(el.style.maxHeight).toBe("");
  });

  it("flips above when there is no room below", () => {
    restore = stubLayout({ w: 400, h: 300 }, { w: 168, h: 196 });
    const el = show(anchorAt({ top: 250, left: 20, w: 40, h: 30 }));
    expect(el.style.top).toBe("48px");
    expect(el.style.left).toBe("20px");
  });

  it("shrinks to the larger side when neither fits", () => {
    restore = stubLayout({ w: 400, h: 300 }, { w: 168, h: 500 });
    const el = show(anchorAt({ top: 100, left: 4, w: 40, h: 30 }));
    // below: 300 - 130 - 6 - 8 = 156 > above: 100 - 6 - 8 = 86
    expect(el.style.top).toBe("136px");
    expect(el.style.maxHeight).toBe("156px");
    expect(el.style.left).toBe("8px");
  });
});

describe("placePopover", () => {
  const a = { top: 40, bottom: 70, left: 10 };
  it("never leaves the 8px margin, even above", () => {
    const p = placePopover(a, { w: 100, h: 200 }, { w: 300, h: 120 });
    expect(p.top).toBeGreaterThanOrEqual(8);
    expect(p.top + (p.maxHeight ?? 200)).toBeLessThanOrEqual(112);
  });
  it("caps the width to the viewport", () => {
    const p = placePopover(a, { w: 500, h: 50 }, { w: 300, h: 600 });
    expect(p.left).toBe(8);
    expect(p.maxWidth).toBe(284);
  });
});
