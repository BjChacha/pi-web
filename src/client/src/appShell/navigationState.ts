import type { ReactiveController, ReactiveControllerHost } from "lit";

/** Navigation sections of the side panel: machine selector and the unified project-session tree. */
export const NAVIGATION_SECTION_ORDER = ["machines", "tree"] as const;
export type NavigationSection = (typeof NAVIGATION_SECTION_ORDER)[number];
export type ExpandedNavigationSection = NavigationSection | "none" | undefined;

export function defaultNavigationSection(): NavigationSection {
  return "tree";
}

export function expandedNavigationSection(expanded: ExpandedNavigationSection): NavigationSection | undefined {
  if (expanded === "none") return undefined;
  return expanded ?? defaultNavigationSection();
}

export function isNavigationSectionCollapsed(section: NavigationSection, options: { isMobileLayout: boolean; expanded: ExpandedNavigationSection; collapsedSections?: readonly NavigationSection[] | undefined }): boolean {
  if (options.isMobileLayout) return expandedNavigationSection(options.expanded) !== section;
  return options.collapsedSections?.includes(section) ?? false;
}

export function toggleNavigationSection(expanded: ExpandedNavigationSection, section: NavigationSection, options: { isMobileLayout: boolean }): ExpandedNavigationSection {
  if (!options.isMobileLayout) return expanded;
  return expandedNavigationSection(expanded) === section ? "none" : section;
}

export function expandNavigationSection(expanded: ExpandedNavigationSection, section: NavigationSection, isMobileLayout: boolean): ExpandedNavigationSection {
  return isMobileLayout ? section : expanded;
}

export function toggleCollapsedNavigationSection(collapsedSections: readonly NavigationSection[], section: NavigationSection): NavigationSection[] {
  const collapsed = new Set(collapsedSections);
  if (collapsed.has(section)) collapsed.delete(section);
  else collapsed.add(section);
  return orderedNavigationSections(collapsed);
}

export function nextNavigationSection(section: NavigationSection): NavigationSection | undefined {
  return NAVIGATION_SECTION_ORDER[NAVIGATION_SECTION_ORDER.indexOf(section) + 1];
}

export class NavigationSectionsController implements ReactiveController {
  private expanded: ExpandedNavigationSection;
  private collapsedSections: readonly NavigationSection[] = [];

  hostConnected(): void {
    return;
  }

  constructor(
    private readonly host: ReactiveControllerHost,
    private readonly isMobileLayout: () => boolean,
  ) {
    host.addController(this);
  }

  expandedSection(): NavigationSection | undefined {
    return expandedNavigationSection(this.expanded);
  }

  isCollapsed(section: NavigationSection): boolean {
    return isNavigationSectionCollapsed(section, {
      isMobileLayout: this.isMobileLayout(),
      expanded: this.expanded,
      collapsedSections: this.collapsedSections,
    });
  }

  toggle(section: NavigationSection): void {
    if (this.isMobileLayout()) {
      this.setExpanded(toggleNavigationSection(this.expanded, section, { isMobileLayout: true }));
      return;
    }
    this.setCollapsedSections(toggleCollapsedNavigationSection(this.collapsedSections, section));
  }

  expand(section: NavigationSection): void {
    if (this.isMobileLayout()) {
      this.setExpanded(expandNavigationSection(this.expanded, section, true));
      return;
    }
    this.setCollapsedSections(this.collapsedSections.filter((collapsedSection) => collapsedSection !== section));
  }

  advanceAfterSelection(section: NavigationSection): void {
    if (!this.isMobileLayout()) return;
    const next = nextNavigationSection(section);
    if (next !== undefined) this.expand(next);
  }

  open(section: NavigationSection, openNavigationView: () => void): void {
    if (!this.isMobileLayout()) return;
    this.expand(section);
    openNavigationView();
  }

  private setExpanded(expanded: ExpandedNavigationSection): void {
    if (this.expanded === expanded) return;
    this.expanded = expanded;
    this.host.requestUpdate();
  }

  private setCollapsedSections(collapsedSections: readonly NavigationSection[]): void {
    if (navigationSectionListsEqual(this.collapsedSections, collapsedSections)) return;
    this.collapsedSections = collapsedSections;
    this.host.requestUpdate();
  }
}

function orderedNavigationSections(sections: Iterable<NavigationSection>): NavigationSection[] {
  const sectionSet = new Set(sections);
  return NAVIGATION_SECTION_ORDER.filter((section) => sectionSet.has(section));
}

function navigationSectionListsEqual(first: readonly NavigationSection[], second: readonly NavigationSection[]): boolean {
  return first.length === second.length && first.every((section, index) => second[index] === section);
}
