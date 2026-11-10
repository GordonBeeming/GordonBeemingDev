import type { SortKey } from "../lib/schema";

const ALL = "All";
const SORT_KEYS: readonly SortKey[] = ["stars", "pushed", "date"];

function isSortKey(value: unknown): value is SortKey {
  return typeof value === "string" && SORT_KEYS.some((key) => key === value);
}

interface Card {
  element: HTMLElement;
  tech: readonly string[];
  stars: number;
  pushed: string;
  date: string;
  tier: number;
  title: string;
}

interface CardList {
  element: HTMLElement;
  cards: Card[];
}

function queryAll<T extends Element>(root: ParentNode, selector: string, type: new () => T): T[] {
  return Array.from(root.querySelectorAll(selector)).filter((node): node is T => node instanceof type);
}

function requireOne<T extends Element>(root: ParentNode, selector: string, type: new () => T): T {
  const node = root.querySelector(selector);
  if (!(node instanceof type)) {
    throw new Error(`Project filter: expected ${selector} to exist as ${type.name}`);
  }
  return node;
}

// A malformed attribute must not break filtering for the other cards, so it degrades to "no tech".
function parseTech(raw: string | undefined): string[] {
  if (raw === undefined) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.warn("Project filter: unreadable data-tech attribute", error);
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item): item is string => typeof item === "string");
}

function parseNumber(raw: string | undefined): number {
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function readCard(element: HTMLElement): Card {
  const data = element.dataset;
  return {
    element,
    tech: parseTech(data["tech"]),
    stars: parseNumber(data["stars"]),
    pushed: data["pushed"] ?? "",
    date: data["date"] ?? "",
    tier: parseNumber(data["tier"]),
    title: data["title"] ?? "",
  };
}

// Same rules as the design's sort: ISO strings compare correctly as text, and an empty pushed date sorts last.
function comparator(sort: SortKey): (a: Card, b: Card) => number {
  switch (sort) {
    case "pushed":
      return (a, b) => b.pushed.localeCompare(a.pushed) || a.title.localeCompare(b.title);
    case "date":
      return (a, b) => b.date.localeCompare(a.date);
    case "stars":
      return (a, b) => a.tier - b.tier || b.stars - a.stars || a.title.localeCompare(b.title);
  }
}

function init(): void {
  const lists: CardList[] = queryAll(document, "[data-card-list]", HTMLElement).map((element) => ({
    element,
    cards: queryAll(element, "[data-card]", HTMLElement).map(readCard),
  }));
  const countLabel = requireOne(document, "[data-count]", HTMLElement);
  const filterButtons = queryAll(document, "button[data-filter]", HTMLButtonElement);
  const sortButtons = queryAll(document, "button[data-sort]", HTMLButtonElement);
  const total = lists.reduce((sum, list) => sum + list.cards.length, 0);

  let filter = ALL;
  let sort: SortKey = "stars";

  function render(): void {
    let shown = 0;
    const compare = comparator(sort);

    for (const list of lists) {
      let visibleInList = 0;
      for (const card of list.cards) {
        const visible = filter === ALL || card.tech.includes(filter);
        card.element.hidden = !visible;
        if (visible) visibleInList += 1;
      }
      // Re-appending moves the existing nodes, so listeners and focus on links survive the reorder.
      for (const card of [...list.cards].sort(compare)) {
        list.element.appendChild(card.element);
      }
      list.element.hidden = visibleInList === 0;
      shown += visibleInList;
    }

    for (const button of filterButtons) {
      button.setAttribute("aria-pressed", String(button.dataset["filter"] === filter));
    }
    for (const button of sortButtons) {
      button.setAttribute("aria-pressed", String(button.dataset["sort"] === sort));
    }
    countLabel.textContent = `${shown} of ${total}${filter === ALL ? "" : ` · ${filter}`}`;
  }

  for (const button of filterButtons) {
    button.addEventListener("click", () => {
      filter = button.dataset["filter"] ?? ALL;
      render();
    });
  }
  for (const button of sortButtons) {
    button.addEventListener("click", () => {
      const next = button.dataset["sort"];
      if (!isSortKey(next)) return;
      sort = next;
      render();
    });
  }
}

init();
