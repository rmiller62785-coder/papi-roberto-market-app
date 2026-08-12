"use client";

import Link from "next/link";
import { useRef } from "react";
import { primaryNav } from "../content";

export function MobileNav() {
  const dialogRef = useRef<HTMLDialogElement>(null);

  function closeMenu() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button className="mobile-nav-trigger" type="button" onClick={() => dialogRef.current?.showModal()} aria-haspopup="dialog">
        <span>Menu</span><i aria-hidden="true" />
      </button>
      <dialog
        className="mobile-nav-dialog"
        ref={dialogRef}
        aria-label="Site navigation"
        onClick={(event) => { if (event.target === dialogRef.current) closeMenu(); }}
      >
        <div className="mobile-nav-panel">
          <header>
            <span>Luna Sol Group</span>
            <button type="button" onClick={closeMenu} aria-label="Close navigation">Close</button>
          </header>
          <nav aria-label="Mobile navigation">
            {primaryNav.map((item, index) => (
              <Link key={item.href} href={item.href} onClick={closeMenu} prefetch={false}>
                <span>{String(index + 1).padStart(2, "0")}</span>{item.label}
              </Link>
            ))}
          </nav>
          <div className="mobile-nav-close">
            <Link className="button" href="/#contact" onClick={closeMenu} prefetch={false}>Get in touch</Link>
            <small>Founder-led · Confidential · Evidence-aware</small>
          </div>
        </div>
      </dialog>
    </>
  );
}
