# Parcel contract

Applies to every carrier integration and to the Parcel Aggregator.
`CONVENTIONS.md` § *Parcel contract* says **which** keys, statuses and events
exist. This file says **when each field is filled, when it is emptied, and which
sensor a parcel is in**. The status mapping itself (which carrier word becomes
which `ParcelStatus`) stays in each carrier's `parcels.py`.

A rule here is a promise every carrier keeps. A carrier that cannot keep one
writes the reason in its own `CLAUDE.md`. A divergence that is not written down
is a bug.

---

## 1. Ground rules

1. **Every key is always present**, in canonical order:
   `carrier`, `barcode`, `sender`, `receiver`, `status`, `raw_status`,
   `delivered`, `delivered_at`, `planned_from`, `planned_to`, `pickup`,
   `pickup_point`, `url`, `weight`, `dimensions`, `history`, `raw`.
   Unknown or not applicable is `None`, never an omitted key and never `""` or
   `0`.
2. **`None` means "the carrier did not say".** Never invent a value: no default
   sender, no poll time as a timestamp, no ETA computed from scan times.
3. **`status` comes first; the rest follows.** `delivered`, `delivered_at`,
   `planned_*` and `pickup` are derived from `status` and the carrier data in
   one pass. They are never parsed a second time from a different field that
   can disagree with `status`.
4. **Timestamps are ISO 8601 strings with an offset.** A carrier's naive local
   time gets the carrier's own zone, never UTC by assumption. Epoch numbers are
   UTC.
5. **`raw` is the full carrier record.** Exceptions are listed in
   `CONVENTIONS.md`, such as codes that open or sign in to something.

---

## 2. Fields

### `carrier`

Constant display name of the carrier (`"DHL"`, `"PostNL"`).

### `barcode`

The tracking code the user recognises. Code-based sources use the code the
user entered. Account-based sources use the carrier's own parcel number. It must
stay the same from poll to poll, because the per-parcel `unique_id` is built
from it.

### `sender`, `receiver`

- `sender` is the name the carrier shows for the sender or shop, else `None`.
  No hard-coded fallback.
- `receiver` is the **addressee's name**, else `None`. It is never the pickup
  point and never a street address or location string.
- A masked name (`J*** D***`) is published as the carrier sent it.

### `status`, `raw_status`

- `status`: one of the eight `ParcelStatus` values. An unmapped value falls back
  to the newest mappable history event, then to `unknown` with a one-shot
  warning (`CONVENTIONS.md`).
- `raw_status`: the carrier's own text for the **current** state, else its code
  for that state, else `None`.

### `delivered`

`delivered` is `True` when the parcel's journey is over:

- `status is DELIVERED`, or
- `status is RETURNING` and the carrier reports it **back at the sender**.

`delivered` is `False` in every other case. A carrier-side delivered flag or
delivery timestamp is an input to the **status mapping**. It is never OR-ed
into `delivered` afterwards.

A parcel the user sends back themselves (a webshop return, any outgoing parcel)
is `DELIVERED` once it reaches its destination. `RETURNING` is for a parcel
that is sent back to its sender.

### `delivered_at`

- Set only when `delivered` is `True`. On an active parcel it is always `None`,
  even if the payload has a delivery field.
- Source, in order:
  1. the carrier's explicit delivery timestamp;
  2. the timestamp of the event that mapped to `DELIVERED` (or to the
     back-at-sender event);
  3. `None`.

  Do not use the newest event's timestamp unless that event is the delivery.
  Never use the poll time or `planned_from`.
- For a pickup-point parcel, `delivered_at` is the moment the recipient
  **collected** it, not the moment it was dropped at the point.
- If the carrier gives only a date, use local `00:00:00` of that day, so sorting
  and retention still work.
- If there is no usable value, publish `None`. The delivered list sorts the
  parcel last and the retention filter keeps it.

### `planned_from`, `planned_to`

**Meaning:** when the parcel is expected to reach its **destination**. For a
home delivery that is the recipient's door, mailbox or neighbour. For a
pickup-point parcel (`pickup` is `True`) it is the moment the parcel arrives at
the pickup point, so a carrier's "ready for collection from" estimate counts. It
is never a scan time and never a collection deadline.

**`planned_from` is the anchor.** Sorting, `next_delivery`, the calendar and the
hot polling tier read only `planned_from`. Therefore:

- `planned_to` is never set without `planned_from`.
- `planned_to` is always later than `planned_from`. Reversed values are
  swapped. Equal values are one moment (see the table).

**Shape.** The shape depends on what the carrier's data contains, never on
which carrier it is:

| The carrier gives | `planned_from` | `planned_to` |
|---|---|---|
| a window (start and end) | start | end |
| one moment with a time | that moment | `23:59:59` local on the same day |
| a date without a time | local `00:00:00` of that day | local `23:59:59` of that day |
| a window given as two dates | first day `00:00:00` | last day `23:59:59` |

A carrier's single moment means "from then, during that day", so it is
stretched to the end of that day. "Local" is the carrier's own zone, also for a
moment the carrier sends in UTC. A moment with no time left in its day (at or
after `23:59:59`) has no `planned_to`.

**When it is emptied.** Emptying applies to the normalised fields only; `raw`
keeps the original.

| `status` | `planned_from` / `planned_to` |
|---|---|
| `registered`, `in_transit`, `out_for_delivery` | as the carrier reports them |
| `problem`, `unknown` | as the carrier reports them; a rescheduled delivery is often a `problem` |
| `at_pickup_point` | `None`: the parcel has reached its destination |
| `returning` | `None`: the delivery is not going to happen |
| `delivered` | `None` |

**Other rules**

- A delivery time in the past on an active parcel is published as the carrier
  sends it. Do not clear it and do not extrapolate.
- Narrowing inside the window is allowed: if the carrier gives a more precise
  expected time **inside** its own window, it may replace `planned_from` while
  `planned_to` stays the window's end (PostNL). A value outside the window is
  ignored.

### `pickup`

- Always a `bool`, never `None`.
- `True` means **the delivery route ends at a pickup point**: a shop, locker,
  Packstation, post office counter or parcel shop. It describes the route, not
  the current status.
- Therefore it **stays `True`** after the parcel is collected (`delivered`), and
  while it is `returning` or `problem`. A parcel that becomes `False` the moment
  it is collected breaks dashboards and the delivered list.
- Source, first match wins:
  1. a structured destination or delivery-type field in the payload;
  2. the parcel having reached `AT_PICKUP_POINT` at any point in the events the
     carrier returned, whether or not the history option is on;
  3. `False`.
- A home delivery that is rerouted to a pickup point becomes `True` from the
  moment the carrier says so.
- A courier picking a parcel up from the sender is **not** `pickup`.
- A carrier without pickup-point delivery publishes a constant `False`, and its
  `CLAUDE.md` says so.

### `pickup_point`

- A display string, or `None`. It is only filled when `pickup` is `True`.
- It is the point's name as the carrier shows it, without an address. When the carrier
  identifies the point only by a code or postcode, publish that rather than
  nothing. Never use a scan location, depot or hub.
- It is filled in **every** status, including `delivered`. It is not limited to
  `AT_PICKUP_POINT`.
- If `pickup` is `True` but the carrier does not name the point, publish `None`.

### `url`

The carrier's consumer tracking page for this parcel. `None` when it cannot be
built, for example when a required postcode is missing. Never an API endpoint.

### `weight`, `dimensions`

- `weight`: a `float` in kilograms. `None` when absent, zero, unparseable or in
  an unknown unit. Convert grams and pounds; never pass a value through with an
  unchecked unit.
- `dimensions`: only when all three sides are known, built with
  `format_dimensions` (centimetres plus a `text` string). Never partial.

### `history`

- `None` when the *Parcel history* option is off. This is the only option that
  controls it.
- A list when the option is on, `[]` when the carrier has no events.
- Sorted oldest to newest, capped at `HISTORY_MAX_EVENTS`. Each entry is
  `{timestamp, status, raw_status}`. `status` is `None` for an event that does
  not map.

---

## 3. Which sensor a parcel is in

Sensors only read normalised parcels. Membership depends on the fields above,
never on a second carrier-specific test.

**Active** means `delivered is False`. **Direction** (incoming or outgoing)
comes from the carrier's data, never from `status`.

| Sensor | Contains | Does not contain |
|---|---|---|
| `incoming_parcels` | every active incoming parcel, in **any** status: `registered`, `in_transit`, `out_for_delivery`, `at_pickup_point`, `returning`, `problem`, `unknown` | delivered parcels, outgoing parcels |
| `delivered_parcels` | incoming parcels with `delivered` `True`, after the retention filter (§3.2) | active parcels |
| `outgoing_parcels` | active outgoing parcels (carriers with outgoing support only) | incoming parcels |
| `outgoing_delivered_parcels` | delivered outgoing parcels, after the retention filter | incoming parcels |
| `awaiting_pickup` | active parcels with `status == AT_PICKUP_POINT`; `pickup` is not checked | everything else |
| `en_route_to_pickup_point` | active parcels with `pickup` and `status` not `AT_PICKUP_POINT` and not `RETURNING` | arrived, returning and delivered parcels |
| `next_delivery` | state = the earliest `planned_from` among active incoming parcels whose window has not ended (§3.3) | parcels without `planned_from`, outgoing parcels |
| deliveries calendar | one event per parcel in the `next_delivery` set | outgoing parcels |
| per-parcel sensor | one per barcode in the active or delivered list, state = `status` | — |

What follows from these rules:

- `incoming_parcels` is always the complete active incoming list. It contains
  everything in `awaiting_pickup` and `en_route_to_pickup_point`.
- `awaiting_pickup` and `en_route_to_pickup_point` never overlap, and neither
  ever holds a delivered parcel.
- `planned_*` is emptied at `at_pickup_point`, `returning` and `delivered`, so
  those parcels leave `next_delivery` and the calendar without a filter in the
  sensor.
- When a parcel goes from `awaiting_pickup` to `delivered`, it moves to
  `delivered_parcels`. `pickup` and `pickup_point` stay filled, so a dashboard
  can still show where it was collected.
- A per-parcel sensor is removed by its summary sensor once the barcode is in
  neither list (the per-parcel sensor never removes itself).

### 3.1 Which sensors a carrier exposes

- Both pickup sensors, `awaiting_pickup` and `en_route_to_pickup_point`, exist
  whenever the carrier can deliver to a pickup point, locker or shop at all.
  Not having seen the status or flag on a real parcel yet is no reason to leave
  them out: the sensor reads 0 until it is seen, and the missing evidence is
  recorded in `PENDING_*` and the carrier's `CLAUDE.md`. The aggregator reads
  ready parcels from `awaiting_pickup`, so a missing sensor loses them.
- A carrier that cannot deliver to pickup points or lockers exposes neither
  sensor, writes that decision in its `CLAUDE.md`, and sets `pickup` to a
  constant `False`.

### 3.2 Sort order and retention

- Active lists: ascending on `planned_from`; parcels without a value last.
- Delivered lists: descending on `delivered_at`; parcels without a value last.
  Use `sort_parcels_by_ts`.
- Retention (days or count) applies only to the delivered sensors. It never
  stops tracking a parcel and never affects events. A parcel without a
  parseable `delivered_at` is kept.

### 3.3 `next_delivery` and the calendar

- Candidates: active incoming parcels with a `planned_from`.
- A parcel whose window has ended is skipped: `(planned_to or planned_from) <
  now`. Otherwise a stale delivery time would show as the next
  delivery.
- Calendar event: start `planned_from`, end `planned_to` (start plus one hour
  if a carrier still has no `planned_to`). The location is `pickup_point` when
  `pickup` is set.
- When the window runs from `00:00:00` to `23:59:59` local, the calendar drops
  the times and publishes an **all-day event** on dates (Home Assistant's end
  date is exclusive, so the day after the last day). A window over several
  whole days becomes an all-day event over those days. Any other window,
  including a moment stretched to `23:59:59`, stays a timed event.

### 3.4 Polling

The hot tier needs `out_for_delivery` **and** `planned_from` less than an hour
away (or no `planned_from`). A date-only delivery starts at `00:00`, so on the
delivery day the tier effectively depends on `out_for_delivery` alone. This is
intended.

---

## 4. Events

The names and payloads are in `CONVENTIONS.md`. The firing rules, the same for
every carrier:

- Nothing fires on the first refresh after setup: it is the baseline.
- `_parcel_registered`: a barcode not seen before whose `status` is not
  `delivered`. A barcode seen for the first time already delivered fires
  nothing.
- `_parcel_status_changed`: `status` changed to anything other than
  `delivered`.
- `_parcel_delivered`: `status` changed **to** `delivered`. This hop fires only
  this event, never `_parcel_status_changed` as well. A return that reaches the
  sender fires no `_parcel_delivered` event; its status stays `returning`.
- `_parcel_delivery_time_changed`: `planned_from` or `planned_to` changed to a
  new value that is not `None`. Going from a value to `None` (including the
  emptying in §2) fires nothing.
- Outgoing parcels: only `_outgoing_parcel_status_changed` and
  `_outgoing_parcel_delivered`, by the same rules. There is no registered event
  and no delivery-time event for outgoing parcels.

---

## 5. Tests that keep this true

For every normalised fixture, each carrier tests:

- the key set and order are exactly the canonical ones;
- `delivered` matches §2 `delivered` (`status is DELIVERED`, or a terminal
  return);
- `delivered_at` is set only when `delivered` is `True`;
- `planned_to` is `None`, or `planned_from` is set and `planned_to` is later
  than `planned_from`;
- `planned_*` is `None` when `status` is `delivered`, `at_pickup_point` or
  `returning`;
- `pickup` is a `bool`, and `pickup_point` is `None` whenever `pickup` is
  `False`;
- a pickup-point parcel that has been collected still has `pickup is True`;
- a single moment with a time gets `23:59:59` local of that day as
  `planned_to`;
- a date without a time gets `00:00:00`–`23:59:59` local.

For the sensors: `awaiting_pickup` and `en_route_to_pickup_point` share no
barcode, and neither contains a delivered parcel. For the calendar: a
`00:00:00`–`23:59:59` window is an all-day event.

