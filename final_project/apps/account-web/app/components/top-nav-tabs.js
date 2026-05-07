import Link from "next/link";

export default function TopNavTabs({ active = "account" }) {
  return (
    <nav className="top-nav-tabs" aria-label="WorkWise navigation">
      <Link className={`top-nav-tab ${active === "account" ? "is-active" : ""}`} href="/">
        Account
      </Link>
      <Link className={`top-nav-tab ${active === "rankings" ? "is-active" : ""}`} href="/companies">
        Rankings
      </Link>
    </nav>
  );
}
