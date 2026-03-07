// Navigation types - adapted from web client (no Inertia dependency)
import type { Component } from 'vue';

export type BreadcrumbItem = {
    title: string;
    href?: string;
};

export type NavItem = {
    title: string;
    href: string;
    icon?: Component;
    isActive?: boolean;
};
