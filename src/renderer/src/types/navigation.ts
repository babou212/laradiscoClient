// Navigation types - adapted from web client (no Inertia dependency)

export type BreadcrumbItem = {
  title: string;
  href?: string;
};

export type NavItem = {
  title: string;
  href: string;
  icon?: string;
  isActive?: boolean;
};
