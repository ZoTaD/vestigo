# Login con Steam (2026-11-04)

## Para qué

Es la base del Deadlockdle: el juego va a tener cuatro modos (uno que mezcla
héroes, objetos y habilidades, y uno de cada cosa por separado), cada modo con
su ranking, y los rankings se reinician cada día. Para que la gente compita, el
puntaje tiene que ser de una cuenta: por eso primero va el login con Steam, y
el juego después, con sus maquetas aparte. Los premios quedan para más
adelante; el juego sale en beta.

Lo pidió ZoTaD: arriba a la derecha la foto de Steam, con un menú como el de
Statlocker y un atajo a tu perfil de Deadlock.

## Qué ve la gente

- En la barra de todo el sitio, a la derecha del idioma: **Sign in with Steam**
  (en español, **Entrar con Steam**).
- El botón lleva a la página oficial de Steam. Al aceptar, vuelve a la página
  donde estaba.
- Con la sesión abierta, en ese lugar va la **foto de Steam**. Al tocarla abre
  un menú con:
  - la foto y el nombre de Steam;
  - **My Deadlock profile**: abre `/<idioma>/deadlock/player/<account_id>`;
  - **Sign out**.
- El perfil de Deadlock se sigue buscando sin cuenta, como hoy. El login es un
  atajo, no un requisito.

## Qué no es

- No es el juego ni el ranking: eso es el plan siguiente, sobre esta base.
- No pide mail ni contraseña. Steam hace el login; a nosotros llega sólo el ID.
- No guarda nada más que el ID de Steam, el nombre y la URL de la foto.

## Cómo está hecho

- **Backend en Cloudflare** (decidido con ZoTaD): un Worker (`api/`) con una
  base D1. Gratis para este volumen y no se duerme por falta de uso.
- **Mismo dominio.** Netlify reenvía `/api/*` al Worker (`*.workers.dev`) con
  un 200 forzado, así que la cookie es de vestigo.gg y no hace falta CORS.
- **Steam OpenID 2.0**, el login de siempre de los sitios de stats:
  1. `GET /api/auth/steam?return=/en/deadlock` redirige a
     `steamcommunity.com/openid/login` con `realm` y `return_to` en
     `SITE_ORIGIN`.
  2. `GET /api/auth/steam/callback` le reenvía los parámetros a Steam con
     `check_authentication` y sólo sigue con `is_valid:true`. Además exige que
     `claimed_id` sea `https://steamcommunity.com/openid/id/<17 cifras>`, que
     `op_endpoint` sea el de Steam y que `return_to` empiece con el nuestro.
  3. Pide nombre y foto a `GetPlayerSummaries` con la clave de la API, guarda
     el usuario y abre la sesión.
- **Sesión**: token al azar de 32 bytes en la cookie `vg_session` (HttpOnly,
  Secure, SameSite=Lax, 30 días). En D1 se guarda sólo su hash SHA-256, así
  que una copia de la base no sirve para entrar. Una segunda cookie `vg_in=1`,
  legible por el JS, avisa que hay sesión: sin ella la página no pregunta
  `/api/me` y el Worker no recibe un pedido por cada visita.
- `GET /api/me` devuelve `{ steamId, accountId, name, avatar }` o 401.
  `POST /api/auth/logout` borra la sesión; exige que `Origin` sea el nuestro.
- **La vuelta**: `return` sólo acepta rutas que empiezan con una sola `/`;
  cualquier otra cosa vuelve a la portada (no hay redirección abierta).
- **El parpadeo**: el HTML prerenderizado dibuja "Sign in". Si hay `vg_in`, la
  barra pinta enseguida la foto guardada en `localStorage` y después la
  confirma con `/api/me`; si contesta 401, borra todo y vuelve al botón.
- **La clave de Steam** es un secreto del Worker (`wrangler secret put
  STEAM_API_KEY`). ZoTaD la pega en la terminal; no pasa por el código.
- **CSP**: no cambia. Las fotos salen de `avatars.steamstatic.com`, ya
  cubierto por `*.steamstatic.com`; `/api` es `self`.
- **En local**: `wrangler dev` en el 8787 y Vite reenvía `/api` ahí, con
  `SITE_ORIGIN=http://localhost:5173`. En las vistas previas de Netlify el
  login no anda (el `realm` es vestigo.gg): se prueba en local.
- **Publicación del Worker**: a mano con `wrangler deploy` por ahora. Una
  Action con token de Cloudflare queda para cuando el juego lo pida.

## Tablas (D1)

```sql
create table users (
  steam_id text primary key,       -- 64 bits, como texto
  name text not null,
  avatar text not null,
  created_at integer not null,
  seen_at integer not null
);
create table sessions (
  token_hash text primary key,     -- SHA-256 del token, en hex
  steam_id text not null references users(steam_id),
  expires_at integer not null
);
```

## Pasos

1. `api/`: Worker, migración, funciones puras con tests (vuelta segura,
   validación de OpenID, ID de Steam → account_id).
2. Crear la base D1 y publicar el Worker; ZoTaD carga la clave.
3. Proxy en `netlify.toml` y en `vite.config.ts`.
4. La cuenta en la barra (`NavAccount.tsx`), cargada aparte del chunk de
   entrada, con su menú, en inglés y en español.
5. Probar en local: entrar, ver la foto, ir al perfil, salir. ZoTaD hace el
   clic en "Sign In" de Steam.
6. Medir con `npm run perf` y abrir el PR.
