"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useRef, useState } from "react";
import { primaryNav, utilityNavigation } from "../content";

export function MobileNav() {
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogId = `mobile-navigation-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [isOpen, setIsOpen] = useState(false);

  function openMenu() {
    dialogRef.current?.showModal();
    setIsOpen(true);
  }

  function closeMenu() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        className="mobile-nav-trigger"
        type="button"
        ref={triggerRef}
        onClick={openMenu}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={dialogId}
      >
        <span>Menu</span><i aria-hidden="true" />
      </button>
      <dialog
        className="mobile-nav-dialog"
        id={dialogId}
        ref={dialogRef}
        aria-labelledby={`${dialogId}-title`}
        onCancel={(event) => {
          event.preventDefault();
          closeMenu();
        }}
        onClose={() => {
          setIsOpen(false);
          requestAnimationFrame(() => triggerRef.current?.focus());
        }}
        onClick={(event) => { if (event.target === dialogRef.current) closeMenu(); }}
      >
        <div className="mobile-nav-panel">
          <header>
            <div>
              <span className="mobile-nav-wordmark" id={`${dialogId}-title`}>Luna Sol <i>Group</i></span>
              <small>Management consulting</small>
            </div>
            <button type="button" onClick={closeMenu} aria-label="Close navigation">Close</button>
          </header>
          <nav aria-label="Mobile navigation">
            {primaryNav.map((item, index) => {
              const isCurrent = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
              return (
                <Link key={item.href} href={item.href} onClick={closeMenu} aria-current={isCurrent ? "page" : undefined} prefetch={false}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{item.label}</strong>
                  <i aria-hidden="true">→</i>
                </Link>
              );
            })}
          </nav>
          <div className="mobile-nav-utility">
            <span>Utility</span>
            <div>
              {utilityNavigation.map((item) => item.external ? (
                <a href={item.href} key={item.href} target="_blank" rel="noreferrer">{item.label} ↗</a>
              ) : (
                <Link href={item.href} key={item.href} onClick={closeMenu} prefetch={false}>{item.label}</Link>
              ))}
            </div>
          </div>
          <div className="mobile-nav-close">
            <Link className="button" href="/#contact" onClick={closeMenu} prefetch={false}>Start a conversation →</Link>
            <small>Founder-led · Confidential · Evidence-aware</small>
          </div>
        </div>
      </dialog>
    </>
  );
}
