import { useEffect, useRef, useState } from "react";
import { useCopy } from "./i18n";
import RouteLink from "./RouteLink";
import { routePath, type Route } from "./route";

/**
 * La cuenta de Steam, a la derecha del idioma (2026-11-04, pedido de ZoTaD).
 *
 * Sin sesión es un enlace a `/api/auth/steam`, que lleva a Steam y vuelve a la
 * misma página. Con sesión es la foto de Steam, que abre un menú con el perfil
 * de Deadlock y "Salir". El backend es el Worker de `api/` (ver
 * `docs/plans/2026-11-04-login-steam.md`).
 *
 * **El HTML prerenderizado siempre dibuja "Entrar"**: no sabe quién mira. Por
 * eso, si la cookie `vg_in` dice que hay sesión, se pinta enseguida la cuenta
 * guardada en `localStorage` y después se confirma con `/api/me`. Sin `vg_in`
 * no se pregunta nada: el Worker no recibe un pedido por cada visita.
 */

interface Account {
  steamId: string;
  accountId: number;
  name: string;
  avatar: string;
}

const STORE = "vg_account";

const hasSession = () => typeof document !== "undefined" && /(?:^|;\s*)vg_in=1/.test(document.cookie);

function stored(): Account | null {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as Account) : null;
  } catch {
    return null;
  }
}

function remember(a: Account | null) {
  try {
    if (a) localStorage.setItem(STORE, JSON.stringify(a));
    else localStorage.removeItem(STORE);
  } catch {
    /* sin almacenamiento, se pregunta cada vez */
  }
}

export default function NavAccount({ route, onNavigate }: { route: Route; onNavigate: (route: Route) => void }) {
  const copy = useCopy().account;
  const [account, setAccount] = useState<Account | null>(null);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasSession()) {
      remember(null);
      return;
    }
    setAccount(stored());
    let alive = true;
    fetch("/api/me", { credentials: "same-origin" })
      .then((r) => (r.ok ? (r.json() as Promise<Account>) : null))
      .then((a) => {
        if (!alive) return;
        remember(a);
        setAccount(a);
      })
      // Sin red, se queda la cuenta guardada: la próxima visita vuelve a preguntar.
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (!account) {
    return (
      <a className="top-steam" href={`/api/auth/steam?return=${encodeURIComponent(routePath(route))}`} rel="nofollow">
        <SteamMark />
        <span className="top-steam-label">{copy.signIn}</span>
      </a>
    );
  }

  const signOut = async () => {
    setOpen(false);
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => {});
    remember(null);
    setAccount(null);
  };

  return (
    <div className="top-account" ref={box}>
      <button
        type="button"
        className="top-avatar"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={copy.menu(account.name)}
        onClick={() => setOpen((o) => !o)}
      >
        <Avatar account={account} size={32} />
      </button>
      {open && (
        <div className="top-account-menu" role="menu">
          <div className="top-account-head">
            <Avatar account={account} size={44} />
            <span className="top-account-name">{account.name}</span>
          </div>
          <RouteLink
            className="top-account-item"
            role="menuitem"
            to={{ ...route, view: "deadlock", dlSection: "player", detail: String(account.accountId) }}
            onNavigate={(r) => {
              setOpen(false);
              onNavigate(r);
            }}
          >
            {copy.deadlockProfile}
          </RouteLink>
          <button type="button" className="top-account-item" role="menuitem" onClick={signOut}>
            {copy.signOut}
          </button>
        </div>
      )}
    </div>
  );
}

function Avatar({ account, size }: { account: Account; size: number }) {
  if (!account.avatar) {
    return (
      <span className="top-avatar-initial" style={{ width: size, height: size }} aria-hidden="true">
        {account.name.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return <img src={account.avatar} alt="" width={size} height={size} decoding="async" referrerPolicy="no-referrer" />;
}

/** El logo de Steam en un solo color, como los logos del menú de juegos. */
function SteamMark() {
  return (
    <svg className="top-steam-ic" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M11.98 0C5.67 0 .5 4.86.02 11.04l6.44 2.66a3.38 3.38 0 0 1 1.92-.6h.19l2.86-4.15v-.06a4.53 4.53 0 1 1 4.53 4.53h-.1l-4.09 2.92v.15a3.4 3.4 0 0 1-6.73.67L.43 15.1A12 12 0 1 0 11.98 0Zm-4.45 18.2-1.47-.61a2.55 2.55 0 1 0 1.4-3.47l1.52.63a1.88 1.88 0 1 1-1.45 3.45Zm11.37-9.26a3.02 3.02 0 1 0-3.02 3.02 3.02 3.02 0 0 0 3.02-3.02Zm-5.28 0a2.27 2.27 0 1 1 2.27 2.27 2.27 2.27 0 0 1-2.27-2.27Z"
      />
    </svg>
  );
}
