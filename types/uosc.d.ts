interface Menu {
    type?: string;
    title?: string;
    items: Item[];
    selected_index?: integer;
    keep_open?: boolean;
    on_close?: string | string[];
    on_search?: string | string[];
    on_paste?: string | string[];
    search_style?: 'on_demand' | 'palette' | 'disabled'; // default: on_demand
    search_debounce?: 'submit' | number; // default: 0
    search_suggestion?: string;
    search_submenus?: boolean;
}

type Item = Command | Submenu;

interface Submenu {
    title?: string;
    hint?: string;
    items: Item[];
    bold?: boolean;
    italic?: boolean;
    align?: 'left'|'center'|'right';
    muted?: boolean;
    separator?: boolean;
    keep_open?: boolean;
    on_search?: string | string[];
    on_paste?: string | string[];
    search_style?: 'on_demand' | 'palette' | 'disabled'; // default: on_demand
    search_debounce?: 'submit' | number; // default: 0
    search_suggestion?: string;
    search_submenus?: boolean;
}

interface Command {
    title?: string;
    hint?: string;
    icon?: string;
    value: string | string[];
    active?: integer;
    selectable?: boolean;
    bold?: boolean;
    italic?: boolean;
    align?: 'left'|'center'|'right';
    muted?: boolean;
    separator?: boolean;
    keep_open?: boolean;
}
