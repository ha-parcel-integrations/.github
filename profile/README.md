# Home Assistant parcel integrations

A suite of [Home Assistant](https://www.home-assistant.io/) custom integrations that track your parcels across carriers — every one speaking the same canonical parcel contract, so your automations and dashboards work the same no matter who delivers.

## Integrations

| Integration | Tracks |
|---|---|
| [ha-dhl-nl](https://github.com/peternijssen/ha-dhl-nl) | DHL eCommerce NL — incoming & outgoing parcels |
| [ha-postnl](https://github.com/peternijssen/ha-postnl) | PostNL — parcels & announced MyMail letters |
| [ha-dpd](https://github.com/peternijssen/ha-dpd) | DPD shipments |
| [ha-gls](https://github.com/peternijssen/ha-gls) | GLS — account-less, tracking number + postcode |
| [ha-parcel-aggregator](https://github.com/peternijssen/ha-parcel-aggregator) | Rolls every carrier above into one unified set of sensors and a single event stream |

## How they fit together

Each carrier integration normalises its data to a shared `ParcelStatus` enum and a common parcel shape, and fires canonical events (`<carrier>_parcel_registered` / `_status_changed` / `_delivery_time_changed`). The **Parcel Aggregator** subscribes to all of them and re-emits a unified stream — so you write one automation like *"when any parcel is out for delivery"* instead of one per carrier.

## Installation

All integrations are distributed via [HACS](https://hacs.xyz/). See each repository's README for setup and configuration.

## Community

💬 Questions or feedback? Join the discussion on the [Home Assistant community](https://community.home-assistant.io/t/packages-postnl-dhl-nl-dpd-and-gls-parcel-integration/112433/).
