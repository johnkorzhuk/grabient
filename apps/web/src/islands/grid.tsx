import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { keepPreviousData, useQuery } from "@tanstack/solid-query";
import { createWindowVirtualizer } from "@tanstack/solid-virtual";
import { keyToSearch, listKey, updateKey, viewParams, type ListKey } from "./params";
import { relativeAge } from "../relative-age";
import { renderPalette } from "../palette";
import { pageNumbers } from "../page-numbers";

export interface PaletteItem {
  seed: string;
  href: string;
  background: string;
  likesCount: number;
  createdAtMs: number;
  // Row defaults for client-side "auto" resolution (hover preview). Optional:
  // stale-cached API payloads may predate these fields.
  style?: string;
  steps?: number;
  angle?: number;
}

export interface ListData {
  palettes: PaletteItem[];
  total: number;
  totalPages: number;
  nowMs: number;
}

const GAP_X = 40; // gap-x-10
const GAP_Y = 80; // gap-y-20 (5rem) — same at every breakpoint, like the current site
// Row pitch matches the current site exactly: 300px card + 80px gap. The
// metadata row (~36px) overflows DOWN into the gap rather than adding to the
// pitch, so the vertical rhythm is identical to grabient.com.
const CARD_H = 300; // h-[300px] (matches current site)

// Column counts mirror the server grid's breakpoints exactly
// (md:2 xl:3 2xl:4 3xl:5 4xl:6).
function colsForWidth(w: number): number {
  if (w >= 3072) return 6;
  if (w >= 1920) return 5;
  if (w >= 1536) return 4;
  if (w >= 1280) return 3;
  if (w >= 768) return 2;
  return 1;
}

// staleTimes mirror the current site's TanStack Query config
// (queries/palettes.ts: popular 10m, newest/oldest 5m).
const staleFor = (k: ListKey) => (k.sort === "popular" ? 600_000 : 300_000);

// Card gradients are computed CLIENT-side from the seed so hover previews and
// param commits re-render instantly with no server round trip. Same code path
// as SSR (renderPalette), so results are pixel-identical to the server HTML.
const bgCache = new Map<string, string>();
function cardBg(p: PaletteItem, k: ListKey): string {
  const style = k.style === "auto" ? p.style : k.style;
  const steps = k.steps === "auto" ? p.steps : k.steps;
  const angle = k.angle === "auto" ? p.angle : k.angle;
  if (style == null || steps == null || angle == null) return p.background;
  const key = `${p.seed}|${style}|${steps}|${angle}`;
  let bg = bgCache.get(key);
  if (bg === undefined) {
    bg = renderPalette(p.seed, style as never, steps, angle)?.background ?? p.background;
    if (bgCache.size > 600) bgCache.clear();
    bgCache.set(key, bg);
  }
  return bg;
}

async function fetchList(k: ListKey): Promise<ListData> {
  const res = await fetch(`/api/palettes${keyToSearch(k)}${keyToSearch(k) ? "&" : "?"}sort=${k.sort}`);
  if (!res.ok) throw new Error(`palettes ${res.status}`);
  return res.json();
}

// A component, NOT a shared const: `const HEART = <svg/>` builds ONE DOM node,
// and a node can only live in one place — reusing it across every card in the
// <For> leaves the heart on at most one card. A function makes a fresh node per
// call, so every card gets its own.
const Heart = () => (
  <svg
    class="heart-i h-[22px] w-[22px] transition-all duration-200"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
  </svg>
);

// Mirrors the SSR likeButton in pages.ts EXACTLY (markup + data attrs). The
// click behavior and liked styling live in app.client.js (delegated listener
// + generated stylesheet), so they keep working across island re-renders.
const LikeButton = (props: { p: PaletteItem; k: ListKey }) => {
  const eff = (auto: string | number, own: string | number | undefined) =>
    auto === "auto" ? own : auto;
  return (
    <button
      type="button"
      data-like-seed={props.p.seed}
      data-like-style={eff(props.k.style, props.p.style)}
      data-like-steps={eff(props.k.steps, props.p.steps)}
      data-like-angle={eff(props.k.angle, props.p.angle)}
      data-count={props.p.likesCount}
      aria-label="Save palette"
      class="likes group/like flex cursor-pointer items-center rounded-md text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <span
        class={`like-count select-none pr-4 font-medium transition-[color,opacity] duration-200${props.p.likesCount > 0 ? "" : " opacity-0"}`}
      >
        {props.p.likesCount > 0 ? props.p.likesCount : 1}
      </span>
      <Heart />
    </button>
  );
};

export function GridIsland(props: { initial: ListData; initialKey: string }) {
  const query = useQuery(() => ({
    queryKey: ["palettes", listKey()] as const,
    queryFn: () => fetchList(listKey()),
    staleTime: staleFor(listKey()),
    placeholderData: keepPreviousData,
    initialData: () =>
      JSON.stringify(listKey()) === props.initialKey ? props.initial : undefined,
    initialDataUpdatedAt: Date.now(),
  }));

  let listEl: HTMLOListElement | undefined;
  const [viewportW, setViewportW] = createSignal(0);
  const [top, setTop] = createSignal(0);

  onMount(() => {
    const measure = () => {
      if (!listEl) return;
      setViewportW(window.innerWidth);
      setTop(listEl.offsetTop);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (listEl) ro.observe(listEl);
    onCleanup(() => ro.disconnect());
  });

  const view = createMemo(() => viewParams());
  const cols = createMemo(() => colsForWidth(viewportW()));
  const rowH = createMemo(() => CARD_H + GAP_Y);
  const items = createMemo(() => query.data?.palettes ?? []);
  const nowMs = createMemo(() => query.data?.nowMs ?? Date.now());
  const rows = createMemo(() => Math.ceil(items().length / cols()));

  const virtualizer = createWindowVirtualizer({
    get count() {
      return rows();
    },
    estimateSize: () => rowH(),
    overscan: 2,
    get scrollMargin() {
      return top();
    },
  });

  const pages = createMemo(() => ({
    page: listKey().page,
    total: query.data?.totalPages ?? 1,
    out: pageNumbers(listKey().page, query.data?.totalPages ?? 1),
  }));

  const goto = (p: number) => {
    updateKey({ page: p }, { push: true });
    scrollTo(0, 0);
  };

  const PBTN =
    "inline-flex items-center justify-center rounded-md w-9 h-8.5 px-3 font-bold text-sm border border-solid bg-background border-input hover:border-muted-foreground/30 hover:bg-background/60 text-muted-foreground hover:text-foreground transition-colors duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/70";

  return (
    <>
      <ol
        class="grid-virtual relative block"
        ref={listEl}
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        <For each={virtualizer.getVirtualItems()}>
          {(row) => (
            <li
              style={{
                position: "absolute",
                top: "0",
                left: "0",
                width: "100%",
                transform: `translateY(${row.start - virtualizer.options.scrollMargin}px)`,
                display: "grid",
                "grid-template-columns": `repeat(${cols()}, 1fr)`,
                gap: `${GAP_X}px`,
              }}
            >
              <For each={items().slice(row.index * cols(), (row.index + 1) * cols())}>
                {(p) => (
                  <div class="group relative w-full">
                    <div class="relative">
                      <div
                        class="glow invisible absolute -inset-3 z-0 rounded-xl opacity-0 blur-lg transition-[opacity,visibility] duration-300 group-hover:visible group-hover:opacity-40 group-active:visible group-active:opacity-40"
                        style={{ background: cardBg(p, view()) }}
                        aria-hidden="true"
                      />
                      <a
                        class="card relative z-10 block h-[300px] overflow-hidden rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
                        href={p.href}
                        style={{ background: cardBg(p, view()) }}
                        aria-label={`Gradient palette ${p.seed}`}
                      />
                    </div>
                    <div class="flex min-h-[28px] items-center justify-between pt-4">
                      <span class="text-sm font-medium text-muted-foreground">
                        {relativeAge(p.createdAtMs, nowMs())}
                      </span>
                      <LikeButton p={p} k={view()} />
                    </div>
                  </div>
                )}
              </For>
            </li>
          )}
        </For>
      </ol>
      <Show when={(query.data?.totalPages ?? 1) > 1}>
        <nav
          class="pages mx-auto mt-16 flex w-full items-center justify-center gap-1 py-3"
          aria-label="Pagination"
        >
          <For each={pages().out}>
            {(p) => (
              <Show
                when={p !== "..."}
                fallback={
                  <span class="flex h-8.5 w-9 items-center justify-center text-muted-foreground">
                    ...
                  </span>
                }
              >
                <a
                  href="#"
                  class={`${PBTN}${p === pages().page ? " border-muted-foreground/30 text-foreground" : ""}`}
                  aria-current={p === pages().page ? "page" : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    goto(p as number);
                  }}
                >
                  {p}
                </a>
              </Show>
            )}
          </For>
        </nav>
      </Show>
    </>
  );
}
