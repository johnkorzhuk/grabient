import { For, Show, createMemo, createSignal } from "solid-js";
import {
  columnFilteringFeature,
  createFilteredRowModel,
  createSortedRowModel,
  createTable,
  filterFns,
  flexRender,
  globalFilteringFeature,
  rowSortingFeature,
  sortFns,
  tableFeatures,
} from "@tanstack/solid-table";

export interface TablePayload {
  headers: string[];
  rows: string[][];
  /** Column indexes whose values are numeric, so they sort as numbers. */
  numeric: number[];
  caption?: string;
}

/**
 * Parses the formatted strings the server already rendered.
 *
 * The server owns formatting — "1,234", "18.3%", "2.1 GB" — because it also
 * writes the static table this island replaces, and the two must agree. So
 * sorting reads a number back out of the display string rather than shipping a
 * second, parallel numeric payload that could drift from it.
 */
function numify(value: string): number {
  const cleaned = value.replace(/[,\s]/g, "");
  const scale = /GB/i.test(cleaned) ? 1e9 : /MB/i.test(cleaned) ? 1e6 : /KB/i.test(cleaned) ? 1e3 : 1;
  const match = /-?\d+(\.\d+)?/.exec(cleaned);
  return match ? Number(match[0]) * scale : Number.NEGATIVE_INFINITY;
}

/**
 * v9 makes features opt-in: a table only carries the code for what it uses.
 * Global filtering is built ON column filtering, so that feature has to be
 * declared even though no per-column filter UI exists here.
 */
const features = tableFeatures({
  rowSortingFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  sortedRowModel: createSortedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  sortFns,
  filterFns,
});

export function SortableTable(props: { payload: TablePayload }) {
  const [sorting, setSorting] = createSignal<Array<{ id: string; desc: boolean }>>([]);
  const [filter, setFilter] = createSignal("");

  const numeric = new Set(props.payload.numeric);
  const columns = createMemo(() =>
    props.payload.headers.map((header, index) => ({
      id: String(index),
      header,
      accessorFn: (row: string[]) => row[index] ?? "",
      sortingFn: numeric.has(index)
        ? (a: { original: string[] }, b: { original: string[] }) =>
            numify(a.original[index] ?? "") - numify(b.original[index] ?? "")
        : "alphanumeric",
    })),
  );

  const table = createTable({
    features,
    get data() {
      return props.payload.rows;
    },
    get columns() {
      return columns();
    },
    state: {
      get sorting() {
        return sorting();
      },
      get globalFilter() {
        return filter();
      },
    },
    onSortingChange: setSorting as never,
    onGlobalFilterChange: setFilter as never,
    // Match on any cell, because the reader is looking for a country or a URL
    // and does not care which column it lives in.
    globalFilterFn: (row: { original: string[] }, _columnId: string, value: unknown) =>
      row.original.some((cell) => cell.toLowerCase().includes(String(value).toLowerCase())),
  } as never) as never as ReturnType<typeof createTable>;

  const total = () => props.payload.rows.length;
  const shown = () => table.getRowModel().rows.length;

  return (
    <div>
      <div class="mb-2 flex items-center justify-between gap-3">
        <input
          type="search"
          value={filter()}
          onInput={(event) => setFilter(event.currentTarget.value)}
          placeholder="Filter rows…"
          aria-label="Filter table rows"
          class="w-full max-w-56 rounded-md border border-edge bg-page px-2 py-1 text-xs text-ink placeholder:text-ink-muted focus:border-ink-muted focus:outline-none"
        />
        <span class="shrink-0 text-[11px] text-ink-muted tabular-nums">
          <Show when={shown() !== total()} fallback={`${total()} rows`}>
            {shown()} of {total()}
          </Show>
        </span>
      </div>
      <div class="max-h-64 overflow-auto">
        <table class="data-table w-full text-xs">
          <thead>
            <For each={table.getHeaderGroups()}>
              {(group) => (
                <tr>
                  <For each={group.headers}>
                    {(header, index) => (
                      <th
                        scope="col"
                        aria-sort={
                          header.column.getIsSorted() === "asc"
                            ? "ascending"
                            : header.column.getIsSorted() === "desc"
                              ? "descending"
                              : "none"
                        }
                        class={`sticky top-0 cursor-pointer border-b border-edge bg-surface px-2 py-1.5 font-semibold text-ink-muted select-none hover:text-ink ${
                          index() === 0 ? "text-left" : "text-right"
                        }`}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <span aria-hidden="true" class="ml-1 inline-block w-2">
                          {header.column.getIsSorted() === "asc"
                            ? "▲"
                            : header.column.getIsSorted() === "desc"
                              ? "▼"
                              : ""}
                        </span>
                      </th>
                    )}
                  </For>
                </tr>
              )}
            </For>
          </thead>
          <tbody>
            <For each={table.getRowModel().rows}>
              {(row) => (
                <tr>
                  <For each={row.getVisibleCells()}>
                    {(cell, index) => (
                      <td
                        class={`border-b border-edge px-2 py-1.5 ${
                          index() === 0 ? "text-left text-ink-secondary" : "text-right"
                        }`}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    )}
                  </For>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
      <Show when={shown() === 0}>
        <p class="mt-2 text-xs text-ink-muted">No rows match “{filter()}”.</p>
      </Show>
    </div>
  );
}
