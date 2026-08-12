"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { megaNavigation } from "../content";

type MegaMenuId = (typeof megaNavigation)[number]["id"];

export function MegaNavigation() {
  const pathname = usePathname();
  const [activeMenu, setActiveMenu] = useState<MegaMenuId | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const triggerRefs = useRef<Partial<Record<MegaMenuId, HTMLButtonElement | null>>>({});

  function closeMenu(restoreFocus = false) {
    const activeTrigger = activeMenu ? triggerRefs.current[activeMenu] : null;
    setActiveMenu(null);
    if (restoreFocus) requestAnimationFrame(() => activeTrigger?.focus());
  }

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) closeMenu();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && activeMenu) {
        event.preventDefault();
        closeMenu(true);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  // The handlers intentionally follow the current active trigger.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMenu]);

  return (
    <nav className="mega-navigation" aria-label="Primary navigation" ref={rootRef}>
      <div className="mega-navigation-triggers">
        {megaNavigation.map((section) => {
          const panelId = `mega-panel-${section.id}`;
          const isOpen = activeMenu === section.id;
          const isCurrent = pathname === `/${section.id}` || pathname.startsWith(`/${section.id}/`);

          return (
            <button
              className={isCurrent ? "is-current" : undefined}
              key={section.id}
              type="button"
              aria-expanded={isOpen}
              aria-controls={panelId}
              ref={(node) => { triggerRefs.current[section.id] = node; }}
              onClick={() => setActiveMenu(isOpen ? null : section.id)}
            >
              {section.label}
              <span aria-hidden="true">{isOpen ? "−" : "+"}</span>
            </button>
          );
        })}
        <Link className={pathname.startsWith("/work") ? "is-current" : undefined} href="/work" prefetch={false}>Case studies</Link>
        <Link className={pathname.startsWith("/about") ? "is-current" : undefined} href="/about" prefetch={false}>About</Link>
      </div>

      {megaNavigation.map((section) => {
        const isOpen = activeMenu === section.id;
        return (
          <section
            className="mega-panel"
            id={`mega-panel-${section.id}`}
            key={section.id}
            aria-label={`${section.label} navigation`}
            hidden={!isOpen}
          >
            <div className="mega-panel-intro">
              <span>{section.eyebrow}</span>
              <h2>{section.title}</h2>
              <Link href={section.overview.href} onClick={() => closeMenu()} prefetch={false}>
                {section.overview.label} <span aria-hidden="true">→</span>
              </Link>
            </div>
            <div className="mega-panel-links">
              {section.items.map((item, index) => (
                <Link href={item.href} key={item.href + item.label} onClick={() => closeMenu()} prefetch={false}>
                  <small>{String(index + 1).padStart(2, "0")}</small>
                  <span>
                    <strong>{item.label}</strong>
                    <em>{item.description}</em>
                  </span>
                </Link>
              ))}
            </div>
            <aside className="mega-panel-proof">
              <span>{section.proof.eyebrow}</span>
              <h3>{section.proof.title}</h3>
              <p>{section.proof.description}</p>
              <Link href={section.proof.href} onClick={() => closeMenu()} prefetch={false}>
                {section.proof.linkLabel} <span aria-hidden="true">↗</span>
              </Link>
            </aside>
          </section>
        );
      })}
    </nav>
  );
}
