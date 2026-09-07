# Torneos en Deadlock: sala de draft, partida personalizada e informe

- **Fecha:** 2026-09-07
- **Estado:** diseño, sin implementar. Pedido de ZoTaD: que la gente que
  organiza torneos pueda usar Vestigo, "un selector de héroes, baneos y demás
  lo hacemos nosotros y creamos la partida con eso".
- **Verificado contra la API** (`api.deadlock-api.com/openapi.json`, 118 rutas)
  y contra lo que publican las herramientas de draft que existen.

---

## 1. Lo que la API sí y no puede

**Sí, y sin clave ni login:**

| Ruta | Qué hace | Límite |
|---|---|---|
| `POST /v1/matches/custom/create` | Un bot crea la sala con `server_region`, `game_mode` (normal / street_brawl), `duplicate_heroes_enabled`, `randomize_lanes`, `cheats_enabled`, `is_publicly_visible`, `min_roster_size`, `callback_url` opcional. Devuelve `party_id` y **`party_code`**. El bot pasa a espectador y se marca listo. | 10 por hora por IP |
| `POST /v1/matches/custom/{lobby_id}/start` | Arranca la partida | 10 por hora por IP |
| `GET /v1/matches/custom/{party_id}/match-id` | El id de la partida una vez creada | 100 por segundo |
| `ready` / `unready` / `leave` | El estado del bot | — |

El bot **se va de la sala a los 15 minutos** de creada, arranque o no. Con
`callback_url`, la API avisa por POST cuando cambian los ajustes de la sala y
cuando arranca la partida (con el `match_id`).

**No:** elegir héroes ni banear desde la API. El pedido de creación no tiene
campo de héroes, y ningún endpoint toca la selección. El cliente del juego
tampoco bloquea héroes en una sala personalizada. **El draft se hace afuera y
se respeta por acuerdo**, que es exactamente lo que hacen todas las
herramientas de draft del juego.

## 2. Lo que hace la competencia

| Herramienta | Qué ofrece |
|---|---|
| **Deadlock Labs · Draft** | Sala con código para compartir, 6v6 / 4v4 / 2v2, 1 a 6 baneos, temporizador por turno (off, 30, 45, 60, 90 s), vista en vivo. Sólo el draft. |
| **LockBlaze · Bans** | Sala de draft 6v6 con enlace para el rival, picks y bans en tiempo real. Sólo el draft, orientado a sus torneos con brackets. |
| **deadlockdraft.com** | "Coordinador de partidas": salas, equipos, draft, integración con Twitch. |
| **Statlocker · /draft** | Tiene página de draft; no se pudo leer (bloquea agentes). |
| **DeadChaps** | Custom games, torneos y stats en vivo. |

Patrón común: **una sala con código, dos capitanes desde dos dispositivos,
turnos con temporizador, vista para espectadores**. Ninguna cierra el círculo
con **la partida real y su informe**: eso lo podemos hacer nosotros, porque
ya tenemos el informe de partida y la API nos da el `match_id` de la sala que
creamos.

## 3. Diseño

Pestaña nueva de Deadlock: **Torneos** (ruta `/deadlock/custom`). Tres pasos
en una sola página, cada uno con su caja:

### 3.1 Sala de draft (en tiempo real)

- **Crear sala**: formato (6v6 / 4v4 / 2v2), baneos por lado (0 a 6), orden
  (por defecto el de Deadlock Labs: baneos alternados, luego picks
  1-2-2-2-2-2-1 con el primer pick a sorteo o al que elija el organizador),
  temporizador por turno (off, 30, 45, 60, 90 s), nombres de los dos equipos.
- **Tres enlaces**: capitán A, capitán B y espectador. Cada enlace lleva un
  token; sólo los dos capitanes escriben. Sin cuenta ni login.
- **El tablero**: la grilla de los 38 héroes con retrato (la del catálogo),
  los baneados apagados, los elegidos en cada lado, el turno que corre y el
  reloj. Si el reloj vence, el turno pasa (baneo perdido, pick al azar entre
  los libres, como en el juego).
- **Estado compartido**: una fila por sala en Supabase (`draft_rooms`: id,
  código, formato, orden, `state` JSON con bans/picks/turno, tokens hasheados,
  `created_at`), y **Supabase Realtime** para que los dos capitanes y los
  espectadores vean cada pick al instante. RLS: leer cualquiera con el código;
  escribir sólo con el token del capitán al que le toca. Las salas caducan a
  las 24 h.

### 3.2 La partida en el juego

Terminado el draft, el organizador aprieta **"Crear la sala en Deadlock"**:
elige región (la lista de 26 de la API, con las de Sudamérica arriba) y modo,
y la página llama a `create`. Muestra:

- el **código de party** grande, con botón de copiar;
- las **instrucciones** en tres pasos: abrir Deadlock → Jugar → Personalizada
  → unirse con el código; cada jugador elige el héroe que le tocó; cuando
  estén todos listos, el organizador aprieta **Arrancar** (que llama a
  `start`) o lo arranca desde el juego;
- el aviso de que el bot se retira a los 15 minutos, con cuenta regresiva.

### 3.3 Después de la partida

La página consulta `match-id` cada 30 s mientras la sala esté viva. Cuando
aparece, enlaza al **informe de partida de Vestigo** y compara los héroes
reales de la partida con el draft: **"el draft se respetó"** o "X jugó Y en vez
de Z". Es lo que ninguna herramienta de draft hace, porque ninguna tiene el
informe.

### 3.4 Vista de espectador

El enlace de espectador muestra el tablero sin controles y con los nombres de
los equipos grandes, pensado para ponerlo en un stream (fondo del tema, sin
barra del sitio). Después de la partida, el mismo enlace muestra el informe.

## 4. Lo que no

- **Cuentas.** Los tokens en el enlace alcanzan; una cuenta obligaría a todo
  el resto del sitio a tener login.
- **Brackets y torneos completos.** Es lo de LockBlaze y Challengermode; lo
  nuestro es la partida y su informe.
- **Forzar el draft en el juego.** No se puede.
- **Overlay in-game.** Otra liga de producto.

## 5. Infraestructura y costo

El sitio sigue estático en Netlify. Lo único nuevo es **Supabase**: una tabla,
Realtime y RLS, dentro del plan gratuito para este volumen (una sala son unos
KB y unas decenas de mensajes). Hay un proyecto en la cuenta
(`ehqumszjcsbftojbseuk`); las credenciales que tiene el conector hoy fallan
(`password authentication failed for user supabase_read_only_user`), así que
hay que decidir si se usa ese o uno nuevo, y cargar la URL y la clave anónima
como variables de entorno del build.

Alternativa sin Supabase: Cloudflare Durable Objects (una sala = un objeto con
WebSocket). Más control, más código. Supabase es el camino corto.

## 6. Fases

| Fase | Qué | Costo |
|---|---|---|
| A | Sala de draft en tiempo real: crear, enlaces, tablero, turnos, reloj, espectador | 2 días |
| B | Crear la sala en el juego, código, instrucciones, arrancar | medio día |
| C | `match-id`, enlace al informe, verificación del draft | medio día |
| D | Pulido: historial de salas del organizador (localStorage), vista para stream | medio día |

La A necesita la decisión de Supabase; la B y la C no, y se podrían publicar
antes como "crear una partida personalizada" a secas.
